import { taskCompletions } from '$lib/server/db/schema';
import { and, eq, isNotNull, isNull, or } from 'drizzle-orm';

/**
 * Attribution predicate for completion history: rows written since the
 * actorId column carry the ACTING user; legacy rows only have the task
 * owner in userId. Either leg attributes a completion to the viewer.
 *
 * ONE home (#092) — the dashboard's streak and the stats page's figures
 * must not grow separate copies of this rule.
 */
export function attributedToViewer(userId: string) {
	return or(
		and(isNotNull(taskCompletions.actorId), eq(taskCompletions.actorId, userId)),
		and(isNull(taskCompletions.actorId), eq(taskCompletions.userId, userId))
	);
}
