/**
 * family families repo: every query over `families`, plus the roster summary
 * a family card needs and the one read-only join into `tasks` for open counts.
 *
 * Each function takes `db: Db` first, contains no authorization and no
 * business rules (the plan gate, the name/colour rules and the card
 * composition live in `family.families.rules.ts`), and reads only this
 * module's tables plus the declared read-only joins into `users` (roster
 * names) and `tasks` (open counts) — rule R3, `FOREIGN_READS.family` in
 * scripts/arch/registry.mjs. It never writes `calendars` or `tasks`: the
 * family calendar row is `FamilyCalendarPort`'s job, inside the same
 * transaction.
 *
 * Writes take the caller's `now` (rule R5); nothing here reads the clock.
 * `insertFamilyWithRoster` writes two tables, so the service calls it inside
 * `withTx`; the repo does not open a transaction of its own.
 *
 * Doc: ./README.md#invariants
 */
import { and, asc, count, eq, inArray, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Db } from '$lib/kernel/db/database.server';
import { families, familyMembers, tasks, users } from '$lib/kernel/db/tables.server';
import type { FamilyMembershipView, FamilyView } from './family.contract';
import type { FamilyPatch } from './family.families.rules';
import { DEFAULT_FAMILY_ROLE, DEFAULT_MEMBER_TYPE } from './family.roles.rules';

/**
 * EVERY family the user holds a membership in, oldest first (`createdAt`, then
 * id so equal timestamps stay deterministic), each with the membership's own
 * role and Member Type, the roster size and every member's first name — one
 * query however many families the user is in (issue 078).
 *
 * `roster` is the family's whole membership set joined back onto the user's
 * own row, and `rosterUser` carries those members' first names home with it,
 * aggregated in first-name order. Both joins are left joins so a family never
 * disappears from the answer.
 */
export async function listMemberships(db: Db, userId: string): Promise<FamilyMembershipView[]> {
	const roster = alias(familyMembers, 'roster');
	const rosterUser = alias(users, 'roster_user');

	const rows = await db
		.select({
			id: families.id,
			name: families.name,
			color: families.color,
			createdAt: families.createdAt,
			role: familyMembers.role,
			memberType: familyMembers.memberType,
			memberCount: count(roster.userId),
			firstNames: sql<
				string[]
			>`coalesce(array_agg(${rosterUser.firstName} order by ${rosterUser.firstName}, ${rosterUser.id}) filter (where ${rosterUser.firstName} is not null), '{}')`
		})
		.from(familyMembers)
		.innerJoin(families, eq(familyMembers.familyId, families.id))
		.leftJoin(roster, eq(roster.familyId, familyMembers.familyId))
		.leftJoin(rosterUser, eq(roster.userId, rosterUser.id))
		.where(eq(familyMembers.userId, userId))
		// families.id is the primary key, so Postgres resolves the other selected
		// family columns from it.
		.groupBy(families.id, familyMembers.role, familyMembers.memberType)
		.orderBy(asc(families.createdAt), asc(families.id));

	return rows.map((row) => ({
		family: { id: row.id, name: row.name, color: row.color, createdAt: row.createdAt },
		role: row.role,
		memberType: row.memberType,
		memberCount: row.memberCount,
		firstNames: row.firstNames ?? []
	}));
}

/** One family by id; null when there is none. No membership check: the service owns who may see it. */
export async function findFamilyById(db: Db, id: string): Promise<FamilyView | null> {
	const [row] = await db.select().from(families).where(eq(families.id, id));
	return row ?? null;
}

/** What a new family is written with: its id and `now` come from the service (rule R5). */
export type NewFamilyWithRoster = {
	readonly id: string;
	/** Already trimmed by `familyDraft`. */
	readonly name: string;
	/** Already resolved by `familyDraft` (a palette colour). */
	readonly color: string;
	readonly creatorId: string;
	/** Already cleaned by `cleanMemberIds`: no blanks, repeats or creator. */
	readonly memberIds: readonly string[];
	readonly now: Date;
};

/**
 * Write a family and its day-one roster: the creator as `creator`, every pick
 * as a plain `member`, all with Member Type `member` (the role is the
 * permission, the Member Type the profile, ADR-0001). `createdAt` is `now`.
 * No calendar row: the service writes it through `FamilyCalendarPort` in the
 * same transaction. Call inside `withTx` so a failed roster insert leaves no
 * family behind.
 */
export async function insertFamilyWithRoster(
	db: Db,
	family: NewFamilyWithRoster
): Promise<FamilyView> {
	const [row] = await db
		.insert(families)
		.values({ id: family.id, name: family.name, color: family.color, createdAt: family.now })
		.returning();
	if (!row) throw new Error('insertFamilyWithRoster: insert returned no row');
	await db.insert(familyMembers).values([
		{
			userId: family.creatorId,
			familyId: row.id,
			role: 'creator',
			memberType: DEFAULT_MEMBER_TYPE
		},
		...family.memberIds.map((userId) => ({
			userId,
			familyId: row.id,
			role: DEFAULT_FAMILY_ROLE,
			memberType: DEFAULT_MEMBER_TYPE
		}))
	]);
	return row;
}

/**
 * Rename and/or recolour one family. `patch` comes from `familyPatch`, which
 * never yields an empty patch (nothing to write is `null` there). Null when no
 * family has that id.
 */
export async function updateFamilyRow(
	db: Db,
	id: string,
	patch: FamilyPatch
): Promise<FamilyView | null> {
	const [row] = await db.update(families).set(patch).where(eq(families.id, id)).returning();
	return row ?? null;
}

/**
 * Open family tasks per family, in ONE grouped query for the whole `/family`
 * page (never one query per card, issue 078). "Open" is the Family Task
 * Board's own definition: not completed and not archived. A family with no
 * open task is absent from the map (the caller reads it as 0); tasks without a
 * family never appear. The only touch on `tasks` in this module, read-only.
 */
export async function countOpenFamilyTasks(
	db: Db,
	familyIds: readonly string[]
): Promise<ReadonlyMap<string, number>> {
	if (familyIds.length === 0) return new Map();
	const rows = await db
		.select({ familyId: tasks.familyId, openTasks: count() })
		.from(tasks)
		.where(
			and(
				inArray(tasks.familyId, [...familyIds]),
				isNull(tasks.completedAt),
				isNull(tasks.archivedAt)
			)
		)
		.groupBy(tasks.familyId);
	const byFamily = new Map<string, number>();
	for (const row of rows) {
		if (row.familyId !== null) byFamily.set(row.familyId, row.openTasks);
	}
	return byFamily;
}

/**
 * The family a person lands in when nobody names one: the OLDEST family they
 * belong to (`createdAt`, then id), never some other member's family. Null when
 * the user has no family. Owner answer Q-024 B (deterministic and #098's rule);
 * a single-family user's answer is the same as the old unordered read.
 */
export async function findMembershipFamilyId(db: Db, userId: string): Promise<string | null> {
	const [row] = await db
		.select({ familyId: familyMembers.familyId })
		.from(familyMembers)
		.innerJoin(families, eq(families.id, familyMembers.familyId))
		.where(eq(familyMembers.userId, userId))
		.orderBy(asc(families.createdAt), asc(families.id))
		.limit(1);
	return row?.familyId ?? null;
}
