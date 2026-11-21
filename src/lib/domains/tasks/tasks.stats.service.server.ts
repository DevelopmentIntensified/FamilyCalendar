/**
 * tasks stats services: the counting path behind `/api/stats`, the Day
 * Dashboard's streak window and the `/calendar/stats` page body.
 *
 * Every completion figure counts `taskCompletions` (never
 * `tasks.completedAt`/`completionCount`, #146) attributed to the viewer by
 * `actorId` with the legacy owner fallback — `attributedToViewer` is the single
 * home for that predicate, in the repo. `doneBy` deliberately stays scoped to
 * the viewer's OWN Task rows (#092): it names the people who did the work on
 * them. Recent = 10, top assigners/assignees = 5, done-by = 6.
 *
 * Names arrive from identity (`listPersonNames` + `personFullName`, the
 * untrimmed `first + ' ' + last` the legacy SQL join rendered) and the roster
 * from family — this module joins neither table. Time comes from `ctx.clock`
 * (rule R5): `now` is read once per call, and the month start is the UTC
 * month — legacy's process zone, which is UTC in production and in the goldens.
 *
 * Legacy homes: `server/db/actions/taskStats.ts` (the figures),
 * `services/statsData.ts` (the page body), `services/streakService.ts` (the
 * streak, now `computeWeeklyStreak` in the rules).
 *
 * Doc: ./README.md#invariants
 */
import type { Actor } from '$lib/kernel/ctx/actor';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import { listPersonNames, personFullName, type PersonName } from '$lib/domains/identity/index.server';
import { listFamilyRoster } from '$lib/domains/family/index.server';
import type { TaskStatsResponse, TaskStatsWire } from './tasks.contract';
import { completionInstantIso, computeWeeklyStreak, monthStartIso } from './tasks.stats.rules';
import {
	countCompletedOnce,
	countRecurringCompletions,
	countRecurringTasks,
	listCompletionInstantRows,
	listDoneByIds,
	listRecentCompletions,
	listTopAssigneeIds,
	listTopAssignerIds,
	monthTotals
} from './tasks.stats.repo.server';

/** Recent rows the "recently completed" list keeps (legacy `limit(10)`). */
export const TASK_STATS_RECENT_LIMIT = 10;

/** Rows in each "top assigner/assignee" figure (legacy `limit(5)`). */
export const TASK_STATS_PEOPLE_LIMIT = 5;

/** Rows in the "done by" figure — legacy's `limit(6)`, one more than the other lists. */
export const TASK_STATS_DONE_BY_LIMIT = 6;

/** History instants the streak window reads (365 days of check-offs). */
export const TASK_STATS_INSTANT_LIMIT = 365;

/** Names for an id set, so one read answers every figure and the list fields. */
type NameIndex = ReadonlyMap<string, PersonName>;

async function namesFor(ctx: Ctx, ids: readonly string[]): Promise<NameIndex> {
	const unique = [...new Set(ids)];
	const rows = await listPersonNames(ctx, unique);
	return new Map(rows.map((row) => [row.id, row]));
}

/**
 * The counting path (legacy `getTaskStats`): completions once, recurring load
 * and check-offs, who assigns the viewer the most and whom they assign, the
 * ten latest check-offs, this month's split and who actually did the work.
 */
export async function getTaskStats(ctx: Ctx, actor: Actor): Promise<TaskStatsWire> {
	// Sequential, not Promise.all: the ctx db may be one transaction session.
	const completedOnce = await countCompletedOnce(ctx.db, actor.id);
	const recurringTasks = await countRecurringTasks(ctx.db, actor.id);
	const recurringCompletions = await countRecurringCompletions(ctx.db, actor.id);
	const assigners = await listTopAssignerIds(ctx.db, {
		userId: actor.id,
		limit: TASK_STATS_PEOPLE_LIMIT
	});
	const assignees = await listTopAssigneeIds(ctx.db, {
		userId: actor.id,
		limit: TASK_STATS_PEOPLE_LIMIT
	});
	const recent = await listRecentCompletions(ctx.db, {
		userId: actor.id,
		limit: TASK_STATS_RECENT_LIMIT
	});
	const month = await monthTotals(ctx.db, {
		userId: actor.id,
		monthStart: monthStartIso(ctx.clock.now())
	});
	const doneBy = await listDoneByIds(ctx.db, {
		userId: actor.id,
		limit: TASK_STATS_DONE_BY_LIMIT
	});

	const names = await namesFor(ctx, [
		...assigners.map((row) => row.id),
		...assignees.map((row) => row.id),
		...doneBy.map((row) => row.id)
	]);

	return {
		completedOnce,
		recurringTasks,
		recurringCompletions,
		// An id with no users row is absent from the index and drops out, as the
		// legacy INNER JOIN dropped it.
		topAssigners: assigners.flatMap((row) => {
			const person = names.get(row.id);
			return person ? [{ name: personFullName(person), total: row.total }] : [];
		}),
		topAssignees: assignees.flatMap((row) => {
			const person = names.get(row.id);
			return person ? [{ name: personFullName(person), total: row.total }] : [];
		}),
		recentlyCompleted: recent.map((row) => ({
			title: row.title,
			completedAt: completionInstantIso(row.completedAt),
			recurring: row.recurrenceFrequency !== null
		})),
		month,
		doneBy: doneBy.flatMap((row) => {
			const person = names.get(row.id);
			return person ? [{ name: person.firstName, count: row.total }] : [];
		})
	};
}

/**
 * The streak window: one ISO instant per attributed history row, newest first,
 * capped at 365 (the same rows the Day Dashboard's streak reads).
 */
export async function listCompletionInstants(
	ctx: Ctx,
	actor: Actor
): Promise<string[]> {
	const rows = await listCompletionInstantRows(ctx.db, {
		userId: actor.id,
		limit: TASK_STATS_INSTANT_LIMIT
	});
	return rows.map((row) => completionInstantIso(row)).filter(Boolean);
}

/**
 * `GET /api/stats` (legacy `loadStats`): the counting path plus the weekly
 * streak, the instants the hero grid draws, today's instant, the month/done-by
 * echo and the family roster (first names + Member Types). A failing roster
 * read answers `[]` and is logged — the page must not 500 over a decoration.
 */
export async function getStatsPage(ctx: Ctx, actor: Actor): Promise<TaskStatsResponse> {
	const now = ctx.clock.now();
	const stats = await getTaskStats(ctx, actor);
	const completionIso = await listCompletionInstants(ctx, actor);
	const todayIso = now.toISOString();

	let roster: { firstName: string; memberType: string }[] = [];
	try {
		const answer = await listFamilyRoster(ctx, actor, null);
		roster = answer.members.map((member) => ({
			firstName: member.firstName,
			// The column defaults to 'member'; a null is a data anomaly, keep the default.
			memberType: member.memberType ?? 'member'
		}));
	} catch (error) {
		ctx.log.warn('stats_roster_failed', {
			message: error instanceof Error ? error.message : String(error)
		});
	}

	return {
		stats,
		streak: computeWeeklyStreak(completionIso, todayIso),
		completionIso,
		todayIso,
		month: stats.month,
		doneBy: stats.doneBy,
		roster
	};
}
