/**
 * feedback repo: every query over `bugReports` and `unmatchedPhrases`.
 *
 * Each function takes `db: Db` first, contains no authorization and no
 * business rules (the caps, the normalizer and the area fallback live in
 * `feedback.rules.ts`), and reads only this module's tables plus the declared
 * read-only join into `users` for the reporter name (rule R3,
 * `FOREIGN_READS.feedback` in scripts/arch/registry.mjs).
 *
 * Writes that stamp a row take the caller's `now` for `updatedAt` (both
 * resolves and the phrase upsert); nothing here reads the process clock (rule
 * R5). An insert's `createdAt` comes from the database `now()` unless the
 * write supplies it — the phrase upsert does, so its row is deterministic.
 *
 * Doc: ./README.md#invariants
 */
import { and, count, desc, eq, isNotNull, isNull, lt, ne, sql } from 'drizzle-orm';
import type { Db } from '$lib/kernel/db/database.server';
import {
	bugReports,
	type BugReportRow,
	type NewBugReportRow,
	type NewUnmatchedPhraseRow,
	type UnmatchedPhraseRow,
	unmatchedPhrases,
	users
} from '$lib/kernel/db/tables.server';
import type { BugReportWithReporter, UnmatchedSource } from './feedback.contract';

/** Store one bug report and return the row as the database wrote it. */
export async function insertBugReport(db: Db, values: NewBugReportRow): Promise<BugReportRow> {
	const [row] = await db.insert(bugReports).values(values).returning();
	if (!row) throw new Error('insertBugReport: insert returned no row');
	return row;
}

/** The report columns plus the reporter's names, newest first once filtered. */
function bugReportsWithReporter(db: Db) {
	return db
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
		.leftJoin(users, eq(users.id, bugReports.userId));
}

/**
 * The open register (`resolvedAt IS NULL`), newest first, with the reporter's
 * names from a left join (`null` when the reporter is gone or the report was
 * anonymous).
 */
export async function listOpenBugReportsWithReporter(
	db: Db
): Promise<BugReportWithReporter[]> {
	return await bugReportsWithReporter(db)
		.where(isNull(bugReports.resolvedAt))
		.orderBy(desc(bugReports.createdAt));
}

/** The resolved register (`resolvedAt IS NOT NULL`), newest first. */
export async function listResolvedBugReportsWithReporter(
	db: Db
): Promise<BugReportWithReporter[]> {
	return await bugReportsWithReporter(db)
		.where(isNotNull(bugReports.resolvedAt))
		.orderBy(desc(bugReports.createdAt));
}

/**
 * Close one report: status `resolved`, the given `resolvedAt`, and `updatedAt`
 * stamped with the same instant (always re-stamped, Q-007). The row keeps the
 * reporter's `userId`; the register's join supplies the names. Null when no
 * row has that id.
 */
export async function resolveBugReport(
	db: Db,
	id: string,
	now: Date
): Promise<BugReportRow | null> {
	const [row] = await db
		.update(bugReports)
		.set({ status: 'resolved', resolvedAt: now, updatedAt: now })
		.where(eq(bugReports.id, id))
		.returning();
	return row ?? null;
}

/** Open reports for the admin nav badge: open = never resolved. */
export async function countOpenBugReports(db: Db): Promise<number> {
	const [row] = await db
		.select({ n: count() })
		.from(bugReports)
		.where(isNull(bugReports.resolvedAt));
	return row?.n ?? 0;
}

/**
 * Retention: closed reports older than the cutoff are deleted. The anchor is
 * `resolvedAt`, falling back to `createdAt` for rows closed without a stamp;
 * open reports never match. Returns the number of rows removed.
 */
export async function pruneClosedBugReports(db: Db, cutoff: Date): Promise<number> {
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

/** The upsert shape for a reported phrase; `unmatchedPhraseUpsert` builds the first three. */
export type UnmatchedPhraseWrite = {
	readonly source: UnmatchedSource;
	/** Already normalized by `normalizePhrase`; the dedup key with `source`. */
	readonly phrase: string;
	/** JSON text of the parse sample, or null to leave any prior sample alone. */
	readonly matched: string | null;
	readonly now: Date;
};

/**
 * Record a phrase the parsers could not handle, deduplicated on
 * `(source, phrase)`: the first report inserts it with `count` 1 and the
 * phrase as both `phrase` and `sample`; a repeat bumps `count`, refreshes
 * `sample`/`updatedAt`, and replaces `matched` only when a sample is supplied
 * (absent and null leave the stored one alone).
 */
export async function upsertUnmatchedPhrase(
	db: Db,
	values: UnmatchedPhraseWrite
): Promise<void> {
	const row: NewUnmatchedPhraseRow = {
		source: values.source,
		phrase: values.phrase,
		sample: values.phrase,
		createdAt: values.now,
		updatedAt: values.now
	};
	if (values.matched !== null) row.matched = values.matched;
	await db.insert(unmatchedPhrases).values(row).onConflictDoUpdate({
		target: [unmatchedPhrases.source, unmatchedPhrases.phrase],
		// `undefined` is dropped from the update set, so a null sample leaves the
		// stored one alone while count/sample/updatedAt always refresh.
		set: {
			count: sql`${unmatchedPhrases.count} + 1`,
			sample: values.phrase,
			updatedAt: values.now,
			matched: values.matched ?? undefined
		}
	});
}

/** The open phrase register: busiest first, then newest first. */
export async function listOpenUnmatchedPhrases(db: Db): Promise<UnmatchedPhraseRow[]> {
	return await db
		.select()
		.from(unmatchedPhrases)
		.where(eq(unmatchedPhrases.resolved, false))
		.orderBy(desc(unmatchedPhrases.count), desc(unmatchedPhrases.createdAt));
}

/** The resolved phrase register, same order as the open one. */
export async function listResolvedUnmatchedPhrases(db: Db): Promise<UnmatchedPhraseRow[]> {
	return await db
		.select()
		.from(unmatchedPhrases)
		.where(eq(unmatchedPhrases.resolved, true))
		.orderBy(desc(unmatchedPhrases.count), desc(unmatchedPhrases.createdAt));
}

/**
 * Resolve one phrase, stamping `updatedAt` with the caller's `now` (which also
 * moves the row's retention anchor, Q-007). Null when no row has that id.
 */
export async function resolveUnmatchedPhrase(
	db: Db,
	id: string,
	now: Date
): Promise<UnmatchedPhraseRow | null> {
	const [row] = await db
		.update(unmatchedPhrases)
		.set({ resolved: true, updatedAt: now })
		.where(eq(unmatchedPhrases.id, id))
		.returning();
	return row ?? null;
}

/** Open phrases for the admin nav badge. */
export async function countOpenUnmatchedPhrases(db: Db): Promise<number> {
	const [row] = await db
		.select({ n: count() })
		.from(unmatchedPhrases)
		.where(eq(unmatchedPhrases.resolved, false));
	return row?.n ?? 0;
}

/**
 * Retention: resolved phrases last touched before the cutoff are deleted.
 * Unresolved phrases are the parser's improvement signal and never match.
 * Returns the number of rows removed.
 */
export async function pruneResolvedUnmatchedPhrases(db: Db, cutoff: Date): Promise<number> {
	const deleted = await db
		.delete(unmatchedPhrases)
		.where(and(eq(unmatchedPhrases.resolved, true), lt(unmatchedPhrases.updatedAt, cutoff)))
		.returning({ id: unmatchedPhrases.id });
	return deleted.length;
}
