/**
 * family invites repo: every query over `familyInviteCodes`, plus the roster
 * size the accept path's family-size cap reads.
 *
 * Each function takes `db: Db` first and contains no authorization and no
 * business rules. Whether a code can still be used (not expired, not used up)
 * is `isInviteUsable(invite, now)` in `family.invites.rules.ts`, evaluated by
 * the service on the row these reads return — the SQL never compares against
 * a clock, so nothing here reads one (rule R5). Reads only this module's
 * tables.
 *
 * `findInviteCodeForUpdate` is the lock the accept transaction serialises on
 * (issue 155): it must run inside `withTx`, and the use-count bump
 * (`incrementInviteUse`) is DB-side so even a stale read can never be written
 * back. Not found is `null`.
 *
 * Doc: ./README.md#invariants
 */
import { count, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '$lib/kernel/db/database.server';
import { familyInviteCodes, familyMembers } from '$lib/kernel/db/tables.server';
import type { InviteCodeView } from './family.contract';

/** Every code of one family, expired and used-up ones included, unordered. */
export async function listInviteCodes(db: Db, familyId: string): Promise<InviteCodeView[]> {
	return await db.select().from(familyInviteCodes).where(eq(familyInviteCodes.familyId, familyId));
}

/**
 * Every code of every family given, in ONE read for the `/family` list (the
 * caller filters the usable ones with `isInviteUsable`). An empty id list
 * answers `[]` without a query.
 */
export async function listInviteCodesForFamilies(
	db: Db,
	familyIds: readonly string[]
): Promise<InviteCodeView[]> {
	if (familyIds.length === 0) return [];
	return await db
		.select()
		.from(familyInviteCodes)
		.where(inArray(familyInviteCodes.familyId, [...familyIds]));
}

/** One code by its exact text, whether or not it is still usable; null when there is none. */
export async function findInviteCode(db: Db, code: string): Promise<InviteCodeView | null> {
	const [row] = await db.select().from(familyInviteCodes).where(eq(familyInviteCodes.code, code));
	return row ?? null;
}

/**
 * The same read, taking `SELECT ... FOR UPDATE` on the row: concurrent accepts
 * of one code queue here, so the expiry, `useCount < maxUses`, duplicate-member
 * and family-size checks that follow see a state no other accept can change
 * mid-flight. Only meaningful inside `withTx`.
 */
export async function findInviteCodeForUpdate(
	db: Db,
	code: string
): Promise<InviteCodeView | null> {
	const [row] = await db
		.select()
		.from(familyInviteCodes)
		.where(eq(familyInviteCodes.code, code))
		.for('update');
	return row ?? null;
}

/** A code to mint: its text, expiry and cap come from the service (`now` through `inviteExpiresAt`). */
export type NewInviteCode = {
	readonly code: string;
	readonly familyId: string;
	readonly expiresAt: Date;
	readonly maxUses: number;
	readonly createdBy: string | null;
};

/** Store one fresh code (`useCount` 0) and return the row. The column default for `maxUses` is never relied on. */
export async function insertInviteCode(db: Db, invite: NewInviteCode): Promise<InviteCodeView> {
	const [row] = await db
		.insert(familyInviteCodes)
		.values({
			code: invite.code,
			familyId: invite.familyId,
			expiresAt: invite.expiresAt,
			maxUses: invite.maxUses,
			useCount: 0,
			createdBy: invite.createdBy
		})
		.returning();
	if (!row) throw new Error('insertInviteCode: insert returned no row');
	return row;
}

/** Revoke one code. Returns the removed row, or null when there was none. */
export async function deleteInviteCode(db: Db, code: string): Promise<InviteCodeView | null> {
	const [row] = await db
		.delete(familyInviteCodes)
		.where(eq(familyInviteCodes.code, code))
		.returning();
	return row ?? null;
}

/**
 * Spend one use, DB-side: `useCount = coalesce(useCount, 0) + 1` computed by
 * Postgres, never from a value the caller read. A NULL count (which
 * `isInviteUsable` reads as zero) counts up from zero instead of staying NULL
 * forever. Null when there is no such code.
 */
export async function incrementInviteUse(db: Db, code: string): Promise<InviteCodeView | null> {
	const [row] = await db
		.update(familyInviteCodes)
		.set({ useCount: sql`coalesce(${familyInviteCodes.useCount}, 0) + 1` })
		.where(eq(familyInviteCodes.code, code))
		.returning();
	return row ?? null;
}

/** How many people are in one family: the number the member-size cap is checked against. */
export async function countFamilyMembers(db: Db, familyId: string): Promise<number> {
	const [row] = await db
		.select({ n: count() })
		.from(familyMembers)
		.where(eq(familyMembers.familyId, familyId));
	return row?.n ?? 0;
}
