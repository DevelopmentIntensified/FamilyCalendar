/**
 * Feedback tables: the bug-report inbox and the unmatched-phrase corpus the
 * parsers learn from.
 *
 * Definitions moved verbatim out of the legacy `src/lib/server/db/schema.ts`
 * (task K-04); `feedback` owns them
 * (scripts/arch/registry.mjs TABLE_OWNERS). Ids come from the kernel id port,
 * "now" from the kernel clock (rule R5).
 *
 * Doc: src/lib/kernel/README.md#database
 */
import {
	boolean,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex
} from 'drizzle-orm/pg-core';
import { systemIds } from '$lib/kernel/ids/ids';
import { systemClock } from '$lib/kernel/time/clock';
import { users } from './identity.tables.server';

export const unmatchedPhrases = pgTable(
	'unmatchedPhrases',
	{
		id: text('id')
			.notNull()
			.primaryKey()
			.$defaultFn(() => systemIds.id()),
		// 'event_parse' (natural-language event input) or 'bulk_edit' (bulk smart op)
		source: text('source').notNull(),
		// Normalized for dedup (lowercased, whitespace collapsed, trimmed)
		phrase: text('phrase').notNull(),
		sample: text('sample').notNull(),
		// JSON string of what the parser matched (title, date, startTime, etc.)
		matched: text('matched'),
		count: integer('count').default(1).notNull(),
		resolved: boolean('resolved').default(false).notNull(),
		createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
		updatedAt: timestamp('updatedAt', { mode: 'date' })
			.defaultNow()
			.$onUpdate(() => systemClock.now())
			.notNull()
	},
	(table) => ({
		sourcePhraseIdx: uniqueIndex('unmatched_phrases_source_phrase_idx').on(
			table.source,
			table.phrase
		)
	})
);

export type UnmatchedPhraseRow = typeof unmatchedPhrases.$inferSelect;
export type NewUnmatchedPhraseRow = typeof unmatchedPhrases.$inferInsert;

export const bugReports = pgTable(
	'bugReports',
	{
		id: text('id')
			.notNull()
			.primaryKey()
			.$defaultFn(() => systemIds.id()),
		// Reporter (nullable if anonymous/guest). FK to users for correlation.
		userId: text('userId').references(() => users.id, { onDelete: 'set null' }),
		// Broad area the bug is about (calendar | tasks | account | payments | other)
		area: text('area').notNull(),
		description: text('description').notNull(),
		// Page URL the user was on when they reported, best-effort.
		url: text('url'),
		status: text('status').default('open').notNull(),
		resolvedAt: timestamp('resolvedAt', { mode: 'date' }),
		createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
		updatedAt: timestamp('updatedAt', { mode: 'date' })
			.defaultNow()
			.$onUpdate(() => systemClock.now())
			.notNull()
	},
	(table) => ({
		statusCreatedIdx: index('bug_reports_status_created_idx').on(table.status, table.createdAt)
	})
);

export type BugReportRow = typeof bugReports.$inferSelect;
export type NewBugReportRow = typeof bugReports.$inferInsert;
