import { createHash, randomBytes } from 'crypto';
import { db } from '$lib/server/db';
import { claimTokens } from '$lib/server/db/schema';
import { and, eq, lt } from 'drizzle-orm';

const TOKEN_TTL_MS = 15 * 60 * 1000;

export function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

export async function issueClaimToken(userId: string, email: string): Promise<string> {
	const token = randomBytes(32).toString('hex');
	await db.insert(claimTokens).values({
		userId,
		tokenHash: hashToken(token),
		email,
		expiresAt: new Date(Date.now() + TOKEN_TTL_MS)
	});
	return token;
}

export async function peekClaimToken(
	token: string
): Promise<{ userId: string; email: string } | null> {
	const [row] = await db
		.select()
		.from(claimTokens)
		.where(eq(claimTokens.tokenHash, hashToken(token)));

	if (!row || row.expiresAt < new Date()) return null;
	return { userId: row.userId, email: row.email };
}

/** Atomically consumes the token (single DELETE ... RETURNING): the row is
 *  removed for exactly one caller; simultaneous clicks see an empty result. */
export async function consumeClaimToken(
	token: string
): Promise<{ userId: string; email: string } | null> {
	const rows = await db
		.delete(claimTokens)
		.where(eq(claimTokens.tokenHash, hashToken(token)))
		.returning();
	const row = rows[0];

	if (!row || row.expiresAt < new Date()) return null;
	return { userId: row.userId, email: row.email };
}

export async function deleteExpiredClaimTokens() {
	await db.delete(claimTokens).where(lt(claimTokens.expiresAt, new Date()));
}

import { claimEmailForUser, getUserByEmail } from '$lib/server/db/actions/users';
import {
	getUserSettings,
	createUserSettings
} from '$lib/server/db/actions/userSettings';
import { mergeGuestIntoUser } from '$lib/server/services/guestMergeService';

export async function findActiveTokenForUser(userId: string, email: string) {
	const [row] = await db
		.select()
		.from(claimTokens)
		.where(and(eq(claimTokens.userId, userId), eq(claimTokens.email, email)));
	return row;
}

/** Outcome of the Anonymous Account Claiming flow. */
export type ClaimVerifyOutcome =
	| { outcome: 'invalid' }
	| { outcome: 'claimed'; userId: string }
	| { outcome: 'merged'; targetUserId: string };

/** Collaborators of the claiming flow, injectable for tests. */
export interface ClaimVerifyDeps {
	peekClaimToken: (token: string) => Promise<{ userId: string; email: string } | null | undefined>;
	consumeClaimToken: (token: string) => Promise<unknown>;
	getUserByEmail: (email: string) => Promise<{ id: string } | null | undefined>;
	mergeGuestIntoUser: (guestId: string, targetUserId: string) => Promise<unknown>;
	claimEmailForUser: (userId: string, email: string) => Promise<unknown>;
	getUserSettings: (userId: string) => Promise<unknown>;
	createUserSettings: (data: { userId: string; timeZone: string }) => Promise<unknown>;
}

const defaultDeps: ClaimVerifyDeps = {
	peekClaimToken,
	consumeClaimToken,
	getUserByEmail,
	mergeGuestIntoUser,
	claimEmailForUser,
	getUserSettings,
	createUserSettings
};

/**
 * Anonymous Account Claiming flow (extracted from `claim/verify/[token]/+server.ts`):
 * peek without consuming (previewing the link in another browser must not burn
 * the token) → ownership check → atomic consume exactly once → on Claim
 * Conflict (email belongs to another registered account) merge the guest into
 * it, otherwise attach the email and backfill settings.
 */
export async function verifyClaimToken(
	token: string,
	currentUserId: string,
	deps: ClaimVerifyDeps = defaultDeps
): Promise<ClaimVerifyOutcome> {
	const claimed = await deps.peekClaimToken(token);

	if (!claimed) {
		return { outcome: 'invalid' };
	}

	if (claimed.userId !== currentUserId) {
		// Token was issued to a different anonymous session.
		return { outcome: 'invalid' };
	}

	// All checks passed — now atomically consume exactly once.
	if (!(await deps.consumeClaimToken(token))) {
		return { outcome: 'invalid' };
	}

	// If the email already belongs to another registered account, and this guest
	// proved ownership by clicking the link in that email's inbox, automatically
	// merge the guest's data into that account.
	const existingUser = await deps.getUserByEmail(claimed.email);
	if (existingUser && existingUser.id !== claimed.userId) {
		await deps.mergeGuestIntoUser(claimed.userId, existingUser.id);
		return { outcome: 'merged', targetUserId: existingUser.id };
	}

	await deps.claimEmailForUser(claimed.userId, claimed.email);

	// Claiming promotes the guest to a real account — make sure settings
	// (and the timezone) carried over from guest mode still exist.
	const existingSettings = await deps.getUserSettings(claimed.userId);
	if (!existingSettings) {
		await deps.createUserSettings({ userId: claimed.userId, timeZone: 'UTC' });
	}

	return { outcome: 'claimed', userId: claimed.userId };
}
