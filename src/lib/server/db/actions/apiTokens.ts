import { createHash, randomBytes } from 'crypto';
import { db } from '$lib/server/db';
import { apiTokens } from '$lib/server/db/schema';
import { getUser } from '$lib/server/db/actions/users';
import { and, eq } from 'drizzle-orm';

/**
 * Personal API tokens (TaskFocus Bearer auth). Same idiom as claimService:
 * node:crypto random token, SHA-256 hex stored, plaintext shown once.
 * Tokens live until revoked — no expiry, no scopes.
 */
export const API_TOKEN_PREFIX = 'fp_';

/** SHA-256 hex of the token — the only form that ever touches the DB. */
export function hashApiToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

/** `fp_` + 32 random bytes as base64url (43 chars, no padding). */
export function mintApiTokenPlaintext(): string {
	return API_TOKEN_PREFIX + randomBytes(32).toString('base64url');
}

/**
 * Mints a token for `userId`. Returns the row plus the plaintext —
 * the ONLY time it is available; callers must display it once.
 */
export async function createApiToken(userId: string, name: string) {
	const token = mintApiTokenPlaintext();
	const [row] = await db
		.insert(apiTokens)
		.values({ userId, name, tokenHash: hashApiToken(token) })
		.returning();
	return { row, token };
}

/** Safe columns for the settings list — the hash never leaves the server. */
export async function listTokensForUser(userId: string) {
	return await db
		.select({
			id: apiTokens.id,
			name: apiTokens.name,
			createdAt: apiTokens.createdAt,
			lastUsedAt: apiTokens.lastUsedAt
		})
		.from(apiTokens)
		.where(eq(apiTokens.userId, userId));
}

/** Scoped to (id, userId) so one user can never revoke another's token. */
export async function revokeToken(userId: string, id: string) {
	await db.delete(apiTokens).where(and(eq(apiTokens.id, id), eq(apiTokens.userId, userId)));
}

export async function touchLastUsed(id: string) {
	await db.update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.id, id));
}

/**
 * Bearer seam for hooks.server.ts: hash → lookup → user. Returns null for
 * malformed/unknown tokens and for tokens whose user is gone (no touch).
 */
export async function getUserForApiToken(token: string) {
	if (!token.startsWith(API_TOKEN_PREFIX)) return null;
	const [row] = await db
		.select()
		.from(apiTokens)
		.where(eq(apiTokens.tokenHash, hashApiToken(token)));
	if (!row) return null;
	const user = await getUser(row.userId);
	if (!user) return null;
	await touchLastUsed(row.id);
	return user;
}
