/**
 * Row builders for feedback's db tests: the bug reports and unmatched phrases
 * the repo and service tests need, in one home (so a schema change updates
 * one file). Kernel seeds only users; a test never inserts one of this
 * module's rows directly.
 *
 * Defaults are readable, not random: the unique `(source, phrase)` index means
 * a test that seeds two phrases passes explicit phrases anyway.
 *
 * Doc: ./README.md#how-to-test
 */
import type { Db } from '$lib/kernel/db/database.server';
import {
	bugReports,
	type BugReportRow,
	type NewBugReportRow,
	type NewUnmatchedPhraseRow,
	type UnmatchedPhraseRow,
	unmatchedPhrases
} from '$lib/kernel/db/tables.server';

/** One bug report; `createdAt`/`updatedAt` stay the database defaults unless overridden. */
export async function seedBugReport(
	db: Db,
	overrides: Partial<NewBugReportRow> = {}
): Promise<BugReportRow> {
	const [row] = await db
		.insert(bugReports)
		.values({
			area: 'tasks',
			description: 'Row vanished',
			url: '/calendar/tasks',
			...overrides
		})
		.returning();
	if (!row) throw new Error('seedBugReport: insert returned no row');
	return row;
}

/** One unmatched phrase; pass `phrase`/`source` whenever a test seeds more than one. */
export async function seedUnmatchedPhrase(
	db: Db,
	overrides: Partial<NewUnmatchedPhraseRow> = {}
): Promise<UnmatchedPhraseRow> {
	const phrase = overrides.phrase ?? 'book dentist';
	const [row] = await db
		.insert(unmatchedPhrases)
		.values({
			source: 'event_parse',
			sample: phrase,
			...overrides,
			phrase
		})
		.returning();
	if (!row) throw new Error('seedUnmatchedPhrase: insert returned no row');
	return row;
}
