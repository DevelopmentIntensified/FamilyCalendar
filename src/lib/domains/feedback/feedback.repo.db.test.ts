/**
 * The feedback repo against real Postgres: every query that filters, orders,
 * joins, upserts or prunes. Each test runs in `rollbackTest`, so the rows it
 * seeds vanish afterwards.
 *
 * Doc: ./README.md#how-to-test
 */
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import { bugReports, unmatchedPhrases } from '$lib/kernel/db/tables.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { seedFeedbackBugReport, seedFeedbackPhrase } from './feedback.fixtures.server';
import {
	countOpenBugReports,
	countOpenUnmatchedPhrases,
	insertBugReport,
	listBugReportsWithReporter,
	listUnmatchedPhrases,
	pruneClosedBugReports,
	pruneResolvedUnmatchedPhrases,
	resolveBugReportRow,
	resolveUnmatchedPhraseRow,
	upsertUnmatchedPhrase
} from './feedback.repo.server';

describe('bug reports', () => {
	rollbackTest('insertBugReport stores the report and returns the row', async (db) => {
		const user = await seedUser(db);
		const row = await insertBugReport(db, {
			userId: user.id,
			area: 'tasks',
			description: 'Row vanished',
			url: '/calendar/tasks'
		});
		expect({
			userId: row.userId,
			area: row.area,
			description: row.description,
			url: row.url,
			status: row.status,
			resolvedAt: row.resolvedAt
		}).toEqual({
			userId: user.id,
			area: 'tasks',
			description: 'Row vanished',
			url: '/calendar/tasks',
			status: 'open',
			resolvedAt: null
		});
	});

	rollbackTest('insertBugReport stores an omitted url as null', async (db) => {
		const row = await insertBugReport(db, {
			area: 'other',
			description: 'Something broke'
		});
		expect(row.url).toBeNull();
		expect(row.userId).toBeNull();
	});

	rollbackTest(
		'listBugReportsWithReporter splits on resolvedAt, joins the reporter and orders newest first',
		async (db) => {
			const reporter = await seedUser(db, { firstName: 'Mia', lastName: 'Ng' });
			await seedFeedbackBugReport(db, {
				userId: reporter.id,
				area: 'tasks',
				description: 'Older open',
				createdAt: new Date('2026-03-01T09:00:00Z')
			});
			await seedFeedbackBugReport(db, {
				userId: null,
				area: 'calendar',
				description: 'Newer open',
				createdAt: new Date('2026-03-02T09:00:00Z')
			});
			const resolved = await seedFeedbackBugReport(db, {
				userId: reporter.id,
				area: 'account',
				description: 'Old fault',
				status: 'resolved',
				resolvedAt: new Date('2026-02-01T09:00:00Z'),
				createdAt: new Date('2026-01-01T09:00:00Z')
			});

			const open = await listBugReportsWithReporter(db, false);
			expect(open.map((row) => row.description)).toEqual(['Newer open', 'Older open']);
			expect(open.map((row) => [row.reporterFirstName, row.reporterLastName])).toEqual([
				[null, null],
				['Mia', 'Ng']
			]);

			const closed = await listBugReportsWithReporter(db, true);
			expect(closed.map((row) => row.id)).toEqual([resolved.id]);
			expect(closed.map((row) => [row.reporterFirstName, row.reporterLastName])).toEqual([
				['Mia', 'Ng']
			]);
		}
	);

	rollbackTest('resolveBugReportRow stamps status and time and returns the row', async (db) => {
		const report = await seedFeedbackBugReport(db);
		const resolvedAt = new Date('2026-04-01T12:00:00Z');
		const row = await resolveBugReportRow(db, report.id, resolvedAt);
		expect(row?.status).toBe('resolved');
		expect(row?.resolvedAt?.getTime()).toBe(resolvedAt.getTime());
		const [stored] = await db.select().from(bugReports).where(eq(bugReports.id, report.id));
		expect(stored.status).toBe('resolved');
		expect(stored.resolvedAt?.getTime()).toBe(resolvedAt.getTime());
	});

	rollbackTest('resolveBugReportRow returns undefined for an unknown id', async (db) => {
		expect(await resolveBugReportRow(db, 'missing-report', new Date())).toBeUndefined();
	});

	rollbackTest('countOpenBugReports counts only rows without resolvedAt', async (db) => {
		await seedFeedbackBugReport(db);
		await seedFeedbackBugReport(db, { description: 'Second open' });
		await seedFeedbackBugReport(db, {
			description: 'Resolved',
			status: 'resolved',
			resolvedAt: new Date('2026-02-01T09:00:00Z')
		});
		expect(await countOpenBugReports(db)).toBe(2);
	});

	rollbackTest(
		'pruneClosedBugReports deletes closed rows before the cutoff and never an open one',
		async (db) => {
			const openOld = await seedFeedbackBugReport(db, {
				description: 'Open, however old',
				createdAt: new Date('2020-01-01T00:00:00Z')
			});
			const closedOld = await seedFeedbackBugReport(db, {
				description: 'Resolved long ago',
				status: 'resolved',
				resolvedAt: new Date('2020-02-01T00:00:00Z')
			});
			const closedWithoutStamp = await seedFeedbackBugReport(db, {
				description: 'Closed, no resolvedAt',
				status: 'resolved',
				createdAt: new Date('2020-03-01T00:00:00Z')
			});
			const closedRecent = await seedFeedbackBugReport(db, {
				description: 'Resolved recently',
				status: 'resolved',
				resolvedAt: new Date('2026-05-01T00:00:00Z')
			});

			const removed = await pruneClosedBugReports(db, new Date('2025-06-01T00:00:00Z'));
			expect(removed).toBe(2);
			const remaining = await db.select({ id: bugReports.id }).from(bugReports);
			expect(remaining.map((row) => row.id).sort()).toEqual(
				[openOld.id, closedRecent.id].sort()
			);
			expect(remaining.map((row) => row.id)).not.toContain(closedOld.id);
			expect(remaining.map((row) => row.id)).not.toContain(closedWithoutStamp.id);
		}
	);
});

describe('unmatched phrases', () => {
	rollbackTest('upsertUnmatchedPhrase inserts once and bumps the count on a repeat', async (db) => {
		const first = new Date('2026-03-01T09:00:00Z');
		await upsertUnmatchedPhrase(db, {
			source: 'event_parse',
			phrase: 'book dentist',
			matched: '{"title":"Book dentist"}',
			updatedAt: first
		});
		let [row] = await db.select().from(unmatchedPhrases);
		expect({ count: row.count, sample: row.sample, matched: row.matched }).toEqual({
			count: 1,
			sample: 'book dentist',
			matched: '{"title":"Book dentist"}'
		});
		expect(row.updatedAt.getTime()).toBe(first.getTime());

		const second = new Date('2026-03-02T09:00:00Z');
		await upsertUnmatchedPhrase(db, {
			source: 'event_parse',
			phrase: 'book dentist',
			matched: null,
			updatedAt: second
		});
		[row] = await db.select().from(unmatchedPhrases);
		expect(row.count).toBe(2);
		expect(row.sample).toBe('book dentist');
		expect(row.updatedAt.getTime()).toBe(second.getTime());
		// No sample supplied: the first parse sample survives.
		expect(row.matched).toBe('{"title":"Book dentist"}');

		await upsertUnmatchedPhrase(db, {
			source: 'event_parse',
			phrase: 'book dentist',
			matched: '{"title":"Second"}',
			updatedAt: new Date('2026-03-03T09:00:00Z')
		});
		[row] = await db.select().from(unmatchedPhrases);
		expect(row.count).toBe(3);
		expect(row.matched).toBe('{"title":"Second"}');
	});

	rollbackTest('upsertUnmatchedPhrase keeps the two sources apart', async (db) => {
		const at = new Date('2026-03-01T09:00:00Z');
		await upsertUnmatchedPhrase(db, {
			source: 'event_parse',
			phrase: 'every tuesday',
			matched: null,
			updatedAt: at
		});
		await upsertUnmatchedPhrase(db, {
			source: 'bulk_edit',
			phrase: 'every tuesday',
			matched: null,
			updatedAt: at
		});
		const rows = await db.select().from(unmatchedPhrases);
		expect(rows.map((row) => [row.source, row.count])).toEqual([
			['event_parse', 1],
			['bulk_edit', 1]
		]);
	});

	rollbackTest('upsertUnmatchedPhrase stores a null sample when none is supplied', async (db) => {
		await upsertUnmatchedPhrase(db, {
			source: 'event_parse',
			phrase: 'call mom',
			matched: null,
			updatedAt: new Date('2026-03-01T09:00:00Z')
		});
		const [row] = await db.select().from(unmatchedPhrases);
		expect(row.matched).toBeNull();
	});

	rollbackTest(
		'listUnmatchedPhrases splits on resolved and orders by count then first seen',
		async (db) => {
			await seedFeedbackPhrase(db, {
				source: 'event_parse',
				phrase: 'call mom',
				sample: 'call mom',
				count: 1,
				createdAt: new Date('2026-03-02T09:00:00Z')
			});
			await seedFeedbackPhrase(db, {
				source: 'event_parse',
				phrase: 'book dentist',
				sample: 'book dentist',
				count: 3,
				createdAt: new Date('2026-03-01T09:00:00Z')
			});
			await seedFeedbackPhrase(db, {
				source: 'event_parse',
				phrase: 'old but popular',
				sample: 'old but popular',
				count: 3,
				createdAt: new Date('2026-02-25T09:00:00Z')
			});
			const resolved = await seedFeedbackPhrase(db, {
				source: 'bulk_edit',
				phrase: 'every tuesday',
				sample: 'every tuesday',
				count: 5,
				resolved: true
			});

			const open = await listUnmatchedPhrases(db, false);
			expect(open.map((row) => row.phrase)).toEqual([
				'book dentist',
				'old but popular',
				'call mom'
			]);
			const closed = await listUnmatchedPhrases(db, true);
			expect(closed.map((row) => row.id)).toEqual([resolved.id]);
		}
	);

	rollbackTest('resolveUnmatchedPhraseRow marks the phrase resolved and returns it', async (db) => {
		const phrase = await seedFeedbackPhrase(db);
		const row = await resolveUnmatchedPhraseRow(db, phrase.id);
		expect(row?.resolved).toBe(true);
		const [stored] = await db
			.select()
			.from(unmatchedPhrases)
			.where(eq(unmatchedPhrases.id, phrase.id));
		expect(stored.resolved).toBe(true);
	});

	rollbackTest('resolveUnmatchedPhraseRow returns undefined for an unknown id', async (db) => {
		expect(await resolveUnmatchedPhraseRow(db, 'missing-phrase')).toBeUndefined();
	});

	rollbackTest('countOpenUnmatchedPhrases counts unresolved rows only', async (db) => {
		await seedFeedbackPhrase(db);
		await seedFeedbackPhrase(db, { phrase: 'call mom', sample: 'call mom' });
		await seedFeedbackPhrase(db, {
			phrase: 'every tuesday',
			sample: 'every tuesday',
			resolved: true
		});
		expect(await countOpenUnmatchedPhrases(db)).toBe(2);
	});

	rollbackTest(
		'pruneResolvedUnmatchedPhrases deletes resolved rows before the cutoff only',
		async (db) => {
			const unresolvedOld = await seedFeedbackPhrase(db, {
				phrase: 'never resolved',
				sample: 'never resolved',
				createdAt: new Date('2020-01-01T00:00:00Z'),
				updatedAt: new Date('2020-01-01T00:00:00Z')
			});
			const resolvedOld = await seedFeedbackPhrase(db, {
				phrase: 'resolved long ago',
				sample: 'resolved long ago',
				resolved: true,
				updatedAt: new Date('2020-02-01T00:00:00Z')
			});
			const resolvedRecent = await seedFeedbackPhrase(db, {
				phrase: 'resolved recently',
				sample: 'resolved recently',
				resolved: true,
				updatedAt: new Date('2026-05-01T00:00:00Z')
			});

			const removed = await pruneResolvedUnmatchedPhrases(db, new Date('2025-06-01T00:00:00Z'));
			expect(removed).toBe(1);
			const remaining = await db.select({ id: unmatchedPhrases.id }).from(unmatchedPhrases);
			expect(remaining.map((row) => row.id).sort()).toEqual(
				[unresolvedOld.id, resolvedRecent.id].sort()
			);
			expect(remaining.map((row) => row.id)).not.toContain(resolvedOld.id);
		}
	);
});
