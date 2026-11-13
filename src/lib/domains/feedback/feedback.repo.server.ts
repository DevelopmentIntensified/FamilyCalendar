/**
 * feedback repo: every query over `bugReports` and `unmatchedPhrases`.
 *
 * Each function takes `db: Db` first, contains no authorization and no
 * business rules (the caps, the normalizer and the area fallback live in
 * `feedback.rules.ts`), and reads only this module's tables plus the declared
 * read-only join into `users` for the reporter name (rule R3,
 * `FOREIGN_READS.feedback` in scripts/arch/registry.mjs).
 *
 * No function reads the clock (rule R5): a resolve takes its `resolvedAt`, an
 * upsert its `updatedAt`, a prune its `cutoff`.
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

/**
 * One register: the resolved reports when `resolved`, else the open ones,
 * newest first, with the reporter's names from a left join (`null` when the
 * reporter is gone or the report was anonymous).
 */
export async function listBugReportsWithReporter(
	db: Db,
	resolved: boolean
): Promise<BugReportWithReporter[]> {
	return await db
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
}

/**
 * Close one report: status `resolved` and the given `resolvedAt` (always
 * re-stamped, Q-007). The row keeps the reporter's `userId`; the register's
 * join supplies the names. Undefined when no row has that id.
 */
export async function resolveBugReportRow(
	db: Db,
	id: string,
	resolvedAt: Date
): Promise<BugReportRow | undefined> {
	const [row] = await db
		.update(bugReports)
		.set({ status: 'resolved', resolvedAt })
		.where(eq(bugReports.id, id))
		.returning();
	return row;
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

/** The upsert shape for a reported phrase; the caller normalizes and serializes. */
export type UnmatchedPhraseUpsert = {
	readonly source: UnmatchedSource;
	/** Already normalized by `normalizePhrase`; the dedup key with `source`. */
	readonly phrase: string;
	/** JSON text of the parse sample, or null to leave any prior sample alone. */
	readonly matched: string | null;
	readonly updatedAt: Date;
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
	input: UnmatchedPhraseUpsert
): Promise<void> {
	const values: NewUnmatchedPhraseRow = {
		source: input.source,
		phrase: input.phrase,
		sample: input.phrase,
		updatedAt: input.updatedAt
	};
	if (input.matched !== null) values.matched = input.matched;
	await db.insert(unmatchedPhrases).values(values).onConflictDoUpdate({
		target: [unmatchedPhrases.source, unmatchedPhrases.phrase],
		// `undefined` is dropped from the update set, so a null sample leaves the
		// stored one alone while count/sample/updatedAt always refresh.
		set: {
			count: sql`${unmatchedPhrases.count} + 1`,
			sample: input.phrase,
			updatedAt: input.updatedAt,
			matched: input.matched ?? undefined
		}
	});
}

/**
 * One phrase register: resolved or open rows, busiest first, then newest first.
 */
export async function listUnmatchedPhrases(
	db: Db,
	resolved: boolean
): Promise<UnmatchedPhraseRow[]> {
	return await db
		.select()
		.from(unmatchedPhrases)
		.where(eq(unmatchedPhrases.resolved, resolved))
		.orderBy(desc(unmatchedPhrases.count), desc(unmatchedPhrases.createdAt));
}

/**
 * Resolve one phrase. `updatedAt` is re-stamped by the column's `$onUpdate`
 * in every update, which also moves the row's retention anchor (Q-007).
 * Undefined when no row has that id.
 */
export async function resolveUnmatchedPhraseRow(
	db: Db,
	id: string
): Promise<UnmatchedPhraseRow | undefined> {
	const [row] = await db
		.update(unmatchedPhrases)
		.set({ resolved: true })
		.where(eq(unmatchedPhrases.id, id))
		.returning();
	return row;
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
