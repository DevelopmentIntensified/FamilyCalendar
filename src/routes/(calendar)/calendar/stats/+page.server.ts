import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getTaskStats, toIsoTimestamp } from '$lib/server/db/actions/taskStats';
import { db } from '$lib/server/db';
import { taskCompletions, tasks, users } from '$lib/server/db/schema';
import { and, count, desc, eq, gte, sql } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { computeWeeklyStreak } from '$lib/server/services/streakService';
import { getFamilyRoster, getUserFamilyId } from '$lib/server/db/actions/families';

/**
 * 093 rerun: the approved stats prototype reads `taskCompletions` - "the one
 * immutable table that exists only because the recurrence cursor overwrites
 * history" - and says so on the page.
 *
 * `getTaskStats` reads `tasks.completedAt`, a column the recurring-task cursor
 * overwrites on every check-off, so its totals drift towards "recurring tasks
 * checked off at least once" rather than "things completed". The two monthly
 * numbers the approved page shows are therefore counted here, from
 * `taskCompletions`, in this loader. `getTaskStats` is left exactly as it is
 * and still supplies the assignment lists and the recent rows.
 */
export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, '/login');
	}
	const userId = event.locals.user.id;
	const nowIso = DateTime.now().toISO()!;

	const [stats, completionRows] = await Promise.all([
		getTaskStats(userId),
		db
			.select({ completedAt: taskCompletions.completedAt })
			.from(taskCompletions)
			.where(eq(taskCompletions.userId, userId))
			.orderBy(desc(taskCompletions.completedAt))
			.limit(365)
	]);

	// pg returns timestamptz with a space separator; the streak math
	// parses ISO. Normalize (and drop unparseable rows).
	const completionIso = completionRows.map((r) => toIsoTimestamp(r.completedAt)).filter(Boolean);

	// The two numbers the approved page puts under "This month", counted over
	// the month that is actually running.
	const monthStart = DateTime.now().startOf('month').toUTC().toISO()!;
	const [[monthRow], actorRows, familyId] = await Promise.all([
		db
			.select({
				total: count(),
				recurring: sql<number>`count(*) filter (where ${tasks.recurrenceFrequency} is not null)::int`
			})
			.from(taskCompletions)
			.innerJoin(tasks, eq(taskCompletions.taskId, tasks.id))
			.where(and(eq(taskCompletions.userId, userId), gte(taskCompletions.completedAt, monthStart))),
		// Who actually checked things off. `actorId` is the ACTING user, which is
		// what separates "assigned to" from "done by"; a row with no actor
		// cannot be attributed to anyone and drops out of the join.
		db
			.select({ name: users.firstName, count: count() })
			.from(taskCompletions)
			.innerJoin(users, eq(taskCompletions.actorId, users.id))
			.where(eq(taskCompletions.userId, userId))
			.groupBy(users.id, users.firstName)
			.orderBy(desc(count()))
			.limit(6),
		getUserFamilyId(userId)
	]);

	const roster = familyId
		? await getFamilyRoster(familyId).catch((error) => {
				console.error('Failed to load family roster for the stats page:', error);
				return [];
			})
		: [];

	return {
		stats,
		streak: computeWeeklyStreak(completionIso, nowIso),
		// The hero's seven squares are drawn from the same instants the streak
		// is, so the grid and the number above it can never disagree.
		completionIso,
		todayIso: nowIso,
		month: { completed: monthRow?.total ?? 0, recurring: monthRow?.recurring ?? 0 },
		doneBy: actorRows.map((r) => ({ name: r.name, count: r.count })),
		roster: roster.map((m) => ({ firstName: m.firstName, memberType: m.memberType }))
	};
};