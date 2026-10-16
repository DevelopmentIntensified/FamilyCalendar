import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getTaskStats, toIsoTimestamp } from '$lib/server/db/actions/taskStats';
import { computeWeeklyStreak } from '$lib/server/services/streakService';
import { getCompletionTimestamps } from '$lib/server/db/actions/dashboard';
import { getFamilyRoster, getUserFamilyId } from '$lib/server/db/actions/families';
import { DateTime } from 'luxon';

/**
 * 093 rerun: the approved stats prototype reads `taskCompletions` - "the one
 * immutable table that exists only because the recurrence cursor overwrites
 * history" - and says so on the page.
 *
 * #146: every completion figure is counted inside the SHARED `getTaskStats`
 * action, from `taskCompletions`. The loader adds no counting of its own — a
 * second counting path here is how the month card and the action drifted
 * apart. The streak reuses the Day Dashboard's `getCompletionTimestamps` plus
 * the shared `computeWeeklyStreak`, so there is one streak definition.
 */
export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, '/login');
	}
	const userId = event.locals.user.id;
	const nowIso = DateTime.now().toISO()!;

	const stats = await getTaskStats(userId);

	// pg returns timestamptz with a space separator; the streak math
	// parses ISO. Normalize (and drop unparseable rows).
	const completionRows = await getCompletionTimestamps(userId);
	const completionIso = completionRows.map((r) => toIsoTimestamp(r.completedAt)).filter(Boolean);

	const familyId = await getUserFamilyId(userId);
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
		// Counted in the shared action, forwarded verbatim — no second path.
		month: stats.month,
		doneBy: stats.doneBy,
		roster: roster.map((m) => ({ firstName: m.firstName, memberType: m.memberType }))
	};
};
