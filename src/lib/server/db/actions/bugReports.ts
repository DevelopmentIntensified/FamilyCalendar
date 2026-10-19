import { db } from '$lib/server/db';
import { bugReports, users, type BugReport } from '$lib/server/db/schema';
import { and, count, desc, eq, isNull, isNotNull, lt, ne, sql } from 'drizzle-orm';

/** Bug report areas offered in the submission form. */
export const BUG_AREAS = [
	'calendar',
	'tasks',
	'account',
	'payments',
	'dashboard',
	'other'
] as const;

export type BugArea = (typeof BUG_AREAS)[number];

export type NewBugReport = {
	userId?: string | null;
	area: BugArea;
	description: string;
	url?: string | null;
};

/**
 * Record a user-submitted bug report. Mirrors reportUnmatchedPhrase: creation
 * must never throw and break the user's request, so failures are logged and
 * swallowed.
 */
export async function createBugReport(input: NewBugReport): Promise<BugReport | null> {
	const area = BUG_AREAS.some((candidate) => candidate === input.area) ? input.area : 'other';
	const description = input.description.trim().slice(0, 5000);
	if (!description) return null;
	try {
		const [row] = await db
			.insert(bugReports)
			.values({
				userId: input.userId ?? null,
				area,
				description,
				url: input.url?.slice(0, 2000) || null
			})
			.returning();
		return row ?? null;
	} catch (error) {
		console.error('Failed to record bug report:', error);
		return null;
	}
}

export type BugReportWithReporter = BugReport & {
	reporterFirstName: string | null;
	reporterLastName: string | null;
};

export async function getBugReportsWithReporter(
	resolved = false
): Promise<BugReportWithReporter[]> {
	const rows = await db
		.select({
			id: bugReports.id,
			userId: bugReports.userId,
			area: bugReports.area,
			description: bugReports.description,
			url: bugReports.url,
			status: bugReports.status,
			resolvedAt: bugReports.resolvedAt,
			createdAt: bugReports.createdAt,
			updatedAt: bugReports.updatedAt,
			reporterFirstName: users.firstName,
			reporterLastName: users.lastName
		})
		.from(bugReports)
		.leftJoin(users, eq(users.id, bugReports.userId))
		.where(resolved ? isNotNull(bugReports.resolvedAt) : isNull(bugReports.resolvedAt))
		.orderBy(desc(bugReports.createdAt));
	return rows;
}

export async function resolveBugReport(id: string): Promise<BugReport | undefined> {
	const [updated] = await db
		.update(bugReports)
		.set({ status: 'resolved', resolvedAt: new Date() })
		.where(and(eq(bugReports.id, id)))
		.returning();
	return updated;
}

/** Open-report count for the admin nav badge (open = never resolved). */
export async function countOpenBugReports(): Promise<number> {
	const [row] = await db
		.select({ n: count() })
		.from(bugReports)
		.where(isNull(bugReports.resolvedAt));
	return row?.n ?? 0;
}

/**
 * #029 M5 — weekly-cron retention: closed reports older than the cutoff are
 * deleted. Anchored on resolvedAt, falling back to createdAt for rows closed
 * without a timestamp; open reports never match. Returns rows removed.
 */
export async function pruneResolvedBugReports(cutoff: Date): Promise<number> {
	const deleted = await db
		.delete(bugReports)
		.where(
			and(
				ne(bugReports.status, 'open'),
				lt(sql`coalesce(${bugReports.resolvedAt}, ${bugReports.createdAt})`, cutoff)
			)
		)
		.returning({ id: bugReports.id });
	return deleted.length;
}
