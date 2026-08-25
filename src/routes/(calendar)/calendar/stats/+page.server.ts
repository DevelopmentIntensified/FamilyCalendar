import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getTaskStats, toIsoTimestamp } from '$lib/server/db/actions/taskStats';
import { db } from '$lib/server/db';
import { taskCompletions } from '$lib/server/db/schema';
import { desc, eq } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { computeWeeklyStreak } from '$lib/server/services/streakService';

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, '/login');
	}
	const [stats, completionRows] = await Promise.all([
		getTaskStats(event.locals.user.id),
		db
			.select({ completedAt: taskCompletions.completedAt })
			.from(taskCompletions)
			.where(eq(taskCompletions.userId, event.locals.user.id))
			.orderBy(desc(taskCompletions.completedAt))
			.limit(365)
	]);
	const streak = computeWeeklyStreak(
		// pg returns timestamptz with a space separator; the streak math
		// parses ISO. Normalize (and drop unparseable rows).
		completionRows.map((r) => toIsoTimestamp(r.completedAt)).filter(Boolean),
		DateTime.now().toISO()!
	);
	return { stats, streak };
};
