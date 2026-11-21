/**
 * The one read the unported Stats page still needs from the Day Dashboard's
 * old selector file: the viewer's completion instants (the streak window).
 *
 * The rest of the selectors moved with the screens that read them
 * (`rankTop3` → tasks' `rankTasks`, the day-event/kids/completion reads →
 * calendar's and tasks' services, `mergeDayCompletions` → tasks'
 * `tasks.list.rules`). This file stays only while `services/statsData.ts`
 * imports it; delete it with the stats screen's port.
 */
import { attributedToViewer } from '$lib/server/db/actions/completionAttribution';
import { db } from '$lib/server/db';
import { taskCompletions } from '$lib/server/db/schema';
import { desc } from 'drizzle-orm';

/**
 * Completion timestamps for the viewer's streak, most-recent first (capped at
 * the year the streak window needs).
 */
export async function getCompletionTimestamps(userId: string): Promise<{ completedAt: string }[]> {
	return await db
		.select({ completedAt: taskCompletions.completedAt })
		.from(taskCompletions)
		.where(attributedToViewer(userId))
		.orderBy(desc(taskCompletions.completedAt))
		.limit(365);
}
