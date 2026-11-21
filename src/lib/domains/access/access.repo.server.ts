/**
 * access repo: every query over `claimTokens`, the one table this module owns.
 * Nothing here reads the clock (R5): each call takes `now`, so expiry,
 * retention and `createdAt` are the caller's decision. A missing, expired or
 * already-consumed token is `null`.
 *
 * The legacy counterparts are `claimService.ts:12-48`; the odd one —
 * `findActiveTokenForUser` — has no importers and is not ported.
 *
 * Two semantics are deliberate:
 * - peek (`findClaimTokenByHash`) never burns: previewing a Claim link in
 *   another browser must not consume it;
 * - consume is one `DELETE … RETURNING`, so exactly one caller wins, and an
 *   expired row is still deleted before the caller is told it was dead
 *   (legacy `consumeClaimToken` behaves that way).
 *
 * Doc: ./README.md#invariants
 */
import { and, eq, gte, lt } from 'drizzle-orm';
import type { Db } from '$lib/kernel/db/database.server';
import { claimTokens, type ClaimTokenRow } from '$lib/kernel/db/tables.server';
import type { ClaimTokenOwner } from './access.contract';

/** What minting a Claim link stores; the id comes from the table's kernel id default. */
export type NewClaimTokenValues = {
	readonly userId: string;
	readonly email: string;
	readonly tokenHash: string;
	readonly expiresAt: Date;
};

/**
 * Store one Claim token and return the row as the database wrote it.
 * `createdAt` is set from the caller's `now`, never the column default.
 */
export async function insertClaimToken(
	db: Db,
	values: NewClaimTokenValues,
	now: Date
): Promise<ClaimTokenRow> {
	const [row] = await db
		.insert(claimTokens)
		.values({ ...values, createdAt: now })
		.returning();
	if (!row) throw new Error('insertClaimToken: insert returned no row');
	return row;
}

/**
 * The live token's owner: the row whose hash matches and whose expiry has not
 * passed. A row expiring exactly at `now` is still live (legacy compares
 * `expiresAt < now`), and the row is left in place.
 */
export async function findClaimTokenByHash(
	db: Db,
	tokenHash: string,
	now: Date
): Promise<ClaimTokenOwner | null> {
	const [row] = await db
		.select({ userId: claimTokens.userId, email: claimTokens.email })
		.from(claimTokens)
		.where(and(eq(claimTokens.tokenHash, tokenHash), gte(claimTokens.expiresAt, now)));
	return row ?? null;
}

/**
 * Atomically consume the token: one `DELETE … RETURNING`, so simultaneous
 * clicks see one winner and one `null`. An expired row is deleted too — the
 * caller learns it was dead, not that it is still there.
 */
export async function consumeClaimToken(
	db: Db,
	tokenHash: string,
	now: Date
): Promise<ClaimTokenOwner | null> {
	const [row] = await db
		.delete(claimTokens)
		.where(eq(claimTokens.tokenHash, tokenHash))
		.returning({
			userId: claimTokens.userId,
			email: claimTokens.email,
			expiresAt: claimTokens.expiresAt
		});
	if (!row || row.expiresAt.getTime() < now.getTime()) return null;
	return { userId: row.userId, email: row.email };
}

/**
 * Retention: tokens that expired before `now` are deleted. A row expiring
 * exactly at `now` survives (same boundary as the peek).
 */
export async function deleteExpiredClaimTokens(db: Db, now: Date): Promise<number> {
	const rows = await db
		.delete(claimTokens)
		.where(lt(claimTokens.expiresAt, now))
		.returning({ id: claimTokens.id });
	return rows.length;
}
