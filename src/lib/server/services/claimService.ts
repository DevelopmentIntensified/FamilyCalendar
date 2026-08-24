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

export async function findActiveTokenForUser(userId: string, email: string) {
	const [row] = await db
		.select()
		.from(claimTokens)
		.where(and(eq(claimTokens.userId, userId), eq(claimTokens.email, email)));
	return row;
}
