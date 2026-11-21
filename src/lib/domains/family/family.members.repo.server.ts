/**
 * family members repo: every query over `familyMembers` and
 * `childConsentRecords`, plus the read-only joins into `users` that name a
 * roster row.
 *
 * Each function takes `db: Db` first and contains no authorization and no
 * business rules (who may add, remove or re-role someone lives in
 * `family.roles.rules.ts` / `family.members.rules.ts`). It reads only this
 * module's tables plus the declared read-only `users` join (rule R3,
 * `FOREIGN_READS.family` in scripts/arch/registry.mjs). It never writes
 * `tasks`: un-assigning a removed member's tasks is `MemberTasksPort`'s job,
 * inside the same transaction as `deleteMembership`.
 *
 * Every lookup names BOTH the user and the family: nothing here asks for "the
 * user's membership" without a family. "Not found" is `null`. Writes that
 * stamp a row take the caller's `now` (rule R5); nothing here reads the clock.
 *
 * Doc: ./README.md#invariants
 */
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Db } from '$lib/kernel/db/database.server';
import {
	childConsentRecords,
	familyMembers,
	users,
	type ChildConsentRecordRow,
	type FamilyMemberRow
} from '$lib/kernel/db/tables.server';
import type {
	FamilyRosterRowView,
	InvitableUser,
	RosterMemberView
} from './family.contract';
import type { FamilyRole, MemberType } from './family.roles.rules';

/** The user's role in one family, or null when they are not a member (or the role is blank). */
export async function findMemberRole(
	db: Db,
	userId: string,
	familyId: string
): Promise<string | null> {
	const [row] = await db
		.select({ role: familyMembers.role })
		.from(familyMembers)
		.where(and(eq(familyMembers.userId, userId), eq(familyMembers.familyId, familyId)));
	return row?.role ?? null;
}

/**
 * The family's creator: the person whose plan sets the family's member limit
 * (issue 091 `getFamilySizeLimit`). Null when the family has no creator row, in
 * which case the caller falls back to the free plan's limit.
 */
export async function findFamilyCreatorId(db: Db, familyId: string): Promise<string | null> {
	const [row] = await db
		.select({ userId: familyMembers.userId })
		.from(familyMembers)
		.where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.role, 'creator')));
	return row?.userId ?? null;
}

/** The membership row of one user in one family; null when they are not in it. */
export async function findMembership(
	db: Db,
	userId: string,
	familyId: string
): Promise<FamilyMemberRow | null> {
	const [row] = await db
		.select()
		.from(familyMembers)
		.where(and(eq(familyMembers.userId, userId), eq(familyMembers.familyId, familyId)));
	return row ?? null;
}

/**
 * One family's whole roster with each person's name and email, the role and
 * the Member Type side by side. Unordered, as the legacy read was: callers that
 * need an order sort the result themselves.
 */
export async function listRoster(db: Db, familyId: string): Promise<RosterMemberView[]> {
	return await db
		.select({
			userId: familyMembers.userId,
			firstName: users.firstName,
			lastName: users.lastName,
			email: users.email,
			role: familyMembers.role,
			memberType: familyMembers.memberType
		})
		.from(familyMembers)
		.innerJoin(users, eq(familyMembers.userId, users.id))
		.where(eq(familyMembers.familyId, familyId));
}

/**
 * The `/family` list's side rail: ONE read for the roster of every family
 * given (never one per card), tagged with its family, no email. First name
 * order, then user id so two people called Sam keep a stable order. An empty
 * id list answers `[]` without a query.
 */
export async function listRosterForFamilies(
	db: Db,
	familyIds: readonly string[]
): Promise<FamilyRosterRowView[]> {
	if (familyIds.length === 0) return [];
	return await db
		.select({
			familyId: familyMembers.familyId,
			userId: users.id,
			firstName: users.firstName,
			lastName: users.lastName,
			role: familyMembers.role,
			memberType: familyMembers.memberType
		})
		.from(users)
		.innerJoin(familyMembers, eq(users.id, familyMembers.userId))
		.where(inArray(familyMembers.familyId, [...familyIds]))
		.orderBy(asc(users.firstName), asc(users.id), asc(familyMembers.familyId));
}

/** A membership to write: the role is the permission, the Member Type the profile (ADR-0001). */
export type NewMembership = {
	readonly userId: string;
	readonly familyId: string;
	readonly role: FamilyRole;
	readonly memberType: MemberType;
};

/**
 * Add one person to one family. A second insert of the same (user, family)
 * pair violates the primary key; the service checks `findMembership` first.
 */
export async function insertMembership(db: Db, membership: NewMembership): Promise<void> {
	await db.insert(familyMembers).values(membership);
}

/** Set one member's role; the Member Type is untouched. Null when they are not in that family. */
export async function updateMemberRole(
	db: Db,
	familyId: string,
	userId: string,
	role: FamilyRole
): Promise<FamilyMemberRow | null> {
	const [row] = await db
		.update(familyMembers)
		.set({ role })
		.where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.userId, userId)))
		.returning();
	return row ?? null;
}

/** Set one member's Member Type; the role is untouched. Null when they are not in that family. */
export async function updateMemberType(
	db: Db,
	familyId: string,
	userId: string,
	memberType: MemberType
): Promise<FamilyMemberRow | null> {
	const [row] = await db
		.update(familyMembers)
		.set({ memberType })
		.where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.userId, userId)))
		.returning();
	return row ?? null;
}

/**
 * Drop one person from one family. Returns the removed row, or null when they
 * were not a member: the caller treats that as a successful no-op (Q-027). No
 * task write here: the service un-assigns the member's tasks through
 * `MemberTasksPort` in the same transaction.
 */
export async function deleteMembership(
	db: Db,
	familyId: string,
	userId: string
): Promise<FamilyMemberRow | null> {
	const [row] = await db
		.delete(familyMembers)
		.where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.userId, userId)))
		.returning();
	return row ?? null;
}

/** The account a direct add points at (any account, verified or not, as the legacy read was); null when none. */
export async function findUserForAdd(db: Db, userId: string): Promise<InvitableUser | null> {
	const [row] = await db
		.select({
			id: users.id,
			firstName: users.firstName,
			lastName: users.lastName,
			email: users.email
		})
		.from(users)
		.where(eq(users.id, userId));
	return row ?? null;
}

/** The evidence a parent gave consent: who, for whom, where, and when (`now`). */
export type NewChildConsent = {
	readonly childUserId: string;
	readonly parentUserId: string;
	readonly familyId: string;
	readonly now: Date;
};

/**
 * Append one consent record (#190). Append-only: there is no update or delete
 * of this table anywhere in the module, and no unique key on the child, so a
 * second record is a second row, not a replacement. `source` is the only
 * surface that records consent today.
 */
export async function insertChildConsent(
	db: Db,
	consent: NewChildConsent
): Promise<ChildConsentRecordRow> {
	const [row] = await db
		.insert(childConsentRecords)
		.values({
			childUserId: consent.childUserId,
			parentUserId: consent.parentUserId,
			familyId: consent.familyId,
			source: 'child-create',
			recordedAt: consent.now
		})
		.returning();
	if (!row) throw new Error('insertChildConsent: insert returned no row');
	return row;
}
