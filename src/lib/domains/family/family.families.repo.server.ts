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
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Db } from '$lib/kernel/db/database.server';
import { families, familyMembers, tasks, users } from '$lib/kernel/db/tables.server';
import type { FamilyMembershipView, FamilyView } from './family.contract';
import type { FamilyPatch } from './family.families.rules';
import { DEFAULT_FAMILY_ROLE, DEFAULT_MEMBER_TYPE } from './family.roles.rules';

/**
 * EVERY family the user holds a membership in, oldest first (`createdAt`, then
 * id so equal timestamps stay deterministic), each with the membership's own
 * role and Member Type, the roster size and every member's first name and real
 * user id — one query however many families the user is in (issue 078).
 *
 * `roster` is the family's whole membership set joined back onto the user's
 * own row, and `rosterUser` carries each member's name and id home together,
 * one pair per member in first-name order (Q-023 B: the pair keeps the real
 * id, so two people who share a first name keep their own avatar colour). Both
 * joins are left joins so a family never disappears from the answer.
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
			members: sql<
				{ userId: string; firstName: string }[]
			>`coalesce(jsonb_agg(jsonb_build_object('userId', ${roster.userId}, 'firstName', ${rosterUser.firstName}) order by ${rosterUser.firstName}, ${rosterUser.id}) filter (where ${rosterUser.firstName} is not null), '[]'::jsonb)`
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
		members: row.members ?? []
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

/** One recent-activity line the family detail page shows: who did what, when. */
export type FamilyActivityRow = {
	readonly kind: 'completed' | 'assigned';
	readonly title: string;
	readonly actorName: string;
	readonly targetName: string | null;
	/** `completedAt` keeps the driver's Postgres text render; `createdAt` is an ISO instant. */
	readonly at: string;
};

/** The legacy `fullName`: first and last joined by one space, blanks dropped. */
function fullName(first: string | null, last: string | null): string {
	return [first, last].filter(Boolean).join(' ');
}

/**
 * The family detail page's recent activity, newest first, at most `limit`
 * lines: completed tasks (whoever held it, else whoever wrote it) and accepted
 * assignments of someone else's task. Read-only joins into `tasks` and `users`
 * (both declared in `FOREIGN_READS.family`); no clock and no rule.
 *
 * `completedAt` keeps the driver's Postgres text render and `createdAt` is an
 * ISO instant, exactly as the legacy `toIso` answered (`mode: 'string'` column
 * vs `Date`).
 */
export async function listRecentFamilyActivity(
	db: Db,
	familyId: string,
	limit = 8
): Promise<FamilyActivityRow[]> {
	const assignee = alias(users, 'assignee');
	const creator = alias(users, 'creator');

	const completedRows = await db
		.select({
			title: tasks.title,
			completedAt: tasks.completedAt,
			assigneeFirst: assignee.firstName,
			assigneeLast: assignee.lastName,
			creatorFirst: creator.firstName,
			creatorLast: creator.lastName
		})
		.from(tasks)
		.leftJoin(assignee, eq(tasks.assignedTo, assignee.id))
		.innerJoin(creator, eq(tasks.userId, creator.id))
		.where(and(eq(tasks.familyId, familyId), isNotNull(tasks.completedAt)))
		.orderBy(desc(tasks.completedAt))
		.limit(limit);

	const assignedRows = await db
		.select({
			title: tasks.title,
			createdAt: tasks.createdAt,
			creatorFirst: creator.firstName,
			creatorLast: creator.lastName,
			assigneeFirst: assignee.firstName,
			assigneeLast: assignee.lastName
		})
		.from(tasks)
		.innerJoin(assignee, eq(tasks.assignedTo, assignee.id))
		.innerJoin(creator, eq(tasks.userId, creator.id))
		.where(
			and(
				eq(tasks.familyId, familyId),
				eq(tasks.assignmentStatus, 'accepted'),
				isNotNull(tasks.assignedTo),
				ne(tasks.assignedTo, tasks.userId)
			)
		)
		.orderBy(desc(tasks.createdAt))
		.limit(limit);

	const items: FamilyActivityRow[] = [
		...completedRows.map((row) => ({
			kind: 'completed' as const,
			title: row.title,
			actorName: fullName(row.assigneeFirst, row.assigneeLast) || fullName(row.creatorFirst, row.creatorLast),
			targetName: null,
			// SAFETY: the query filters isNotNull(tasks.completedAt), so the column is non-null here.
			at: row.completedAt as string
		})),
		...assignedRows.map((row) => ({
			kind: 'assigned' as const,
			title: row.title,
			actorName: fullName(row.creatorFirst, row.creatorLast),
			targetName: fullName(row.assigneeFirst, row.assigneeLast),
			at: row.createdAt.toISOString()
		}))
	]
		.sort((a, b) => (a.at < b.at ? 1 : -1))
		.slice(0, limit);

	return items;
}
