/**
 * The feedback repo against real Postgres: every query that filters, orders,
 * joins, upserts or prunes. Each test runs in `rollbackTest`, so the rows it
 * seeds vanish afterwards. Writes are given their `now`, so the tests assert
 * the stamped timestamps instead of trusting a clock.
 *
 * Doc: ./README.md#how-to-test
 */
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import { bugReports, unmatchedPhrases } from '$lib/kernel/db/tables.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { seedBugReport, seedUnmatchedPhrase } from './feedback.fixtures.server';
import {
	countOpenBugReports,
	countOpenUnmatchedPhrases,
	insertBugReport,
	listOpenBugReportsWithReporter,
	listOpenUnmatchedPhrases,
	listResolvedBugReportsWithReporter,
	listResolvedUnmatchedPhrases,
	pruneClosedBugReports,
	pruneResolvedUnmatchedPhrases,
	resolveBugReport,
	resolveUnmatchedPhrase,
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
		'listOpenBugReportsWithReporter joins the reporter and orders newest first',
		async (db) => {
			const reporter = await seedUser(db, { firstName: 'Mia', lastName: 'Ng' });
			await seedBugReport(db, {
				userId: reporter.id,
				area: 'tasks',
				description: 'Older open',
				createdAt: new Date('2026-03-01T09:00:00Z')
			});
			await seedBugReport(db, {
				userId: null,
				area: 'calendar',
				description: 'Newer open',
				createdAt: new Date('2026-03-02T09:00:00Z')
			});
			await seedBugReport(db, {
				userId: reporter.id,
				area: 'account',
				description: 'Resolved',
				status: 'resolved',
				resolvedAt: new Date('2026-02-01T09:00:00Z')
			});

			const open = await listOpenBugReportsWithReporter(db);
			expect(open.map((row) => row.description)).toEqual(['Newer open', 'Older open']);
			expect(open.map((row) => [row.reporterFirstName, row.reporterLastName])).toEqual([
				[null, null],
				['Mia', 'Ng']
			]);
		}
	);

	rollbackTest(
		'listResolvedBugReportsWithReporter keeps only resolved rows, newest first',
		async (db) => {
			const reporter = await seedUser(db, { firstName: 'Mia', lastName: 'Ng' });
			await seedBugReport(db, { description: 'Still open' });
			const older = await seedBugReport(db, {
				userId: reporter.id,
				description: 'Older resolved',
				status: 'resolved',
				resolvedAt: new Date('2026-02-01T09:00:00Z'),
				createdAt: new Date('2026-01-01T09:00:00Z')
			});
			const newer = await seedBugReport(db, {
				userId: reporter.id,
				description: 'Newer resolved',
				status: 'resolved',
				resolvedAt: new Date('2026-04-01T09:00:00Z'),
				createdAt: new Date('2026-03-01T09:00:00Z')
			});

			const resolved = await listResolvedBugReportsWithReporter(db);
			expect(resolved.map((row) => row.id)).toEqual([newer.id, older.id]);
			expect(resolved.map((row) => row.description)).toEqual([
				'Newer resolved',
				'Older resolved'
			]);
			expect(resolved.map((row) => [row.reporterFirstName, row.reporterLastName])).toEqual([
				['Mia', 'Ng'],
				['Mia', 'Ng']
			]);
		}
	);

	rollbackTest('resolveBugReport stamps status and both timestamps', async (db) => {
		const report = await seedBugReport(db);
		const now = new Date('2026-04-01T12:00:00Z');
		const row = await resolveBugReport(db, report.id, now);
		expect(row?.status).toBe('resolved');
		expect(row?.resolvedAt?.getTime()).toBe(now.getTime());
		expect(row?.updatedAt.getTime()).toBe(now.getTime());
		const [stored] = await db.select().from(bugReports).where(eq(bugReports.id, report.id));
		expect(stored.status).toBe('resolved');
		expect(stored.resolvedAt?.getTime()).toBe(now.getTime());
		expect(stored.updatedAt.getTime()).toBe(now.getTime());
	});

	rollbackTest('resolveBugReport returns null for an unknown id', async (db) => {
		expect(await resolveBugReport(db, 'missing-report', new Date('2026-04-01T12:00:00Z'))).toBeNull();
	});

	rollbackTest('countOpenBugReports counts only rows without resolvedAt', async (db) => {
		await seedBugReport(db);
		await seedBugReport(db, { description: 'Second open' });
		await seedBugReport(db, {
			description: 'Resolved',
			status: 'resolved',
			resolvedAt: new Date('2026-02-01T09:00:00Z')
		});
		expect(await countOpenBugReports(db)).toBe(2);
	});

	rollbackTest(
		'pruneClosedBugReports deletes closed rows before the cutoff and never an open one',
		async (db) => {
			const openOld = await seedBugReport(db, {
				description: 'Open, however old',
				createdAt: new Date('2020-01-01T00:00:00Z')
			});
			const closedOld = await seedBugReport(db, {
				description: 'Resolved long ago',
				status: 'resolved',
				resolvedAt: new Date('2020-02-01T00:00:00Z')
			});
			const closedWithoutStamp = await seedBugReport(db, {
				description: 'Closed, no resolvedAt',
				status: 'resolved',
				createdAt: new Date('2020-03-01T00:00:00Z')
			});
			// The coalesce must read `resolvedAt` first: this row was created long
			// ago but closed recently, so retention keeps it.
			const closedOldCreatedRecentResolved = await seedBugReport(db, {
				description: 'Created long ago, resolved recently',
				status: 'resolved',
				createdAt: new Date('2020-04-01T00:00:00Z'),
				resolvedAt: new Date('2026-05-01T00:00:00Z')
			});
			const closedRecent = await seedBugReport(db, {
				description: 'Resolved recently',
				status: 'resolved',
				resolvedAt: new Date('2026-05-01T00:00:00Z')
			});

			const removed = await pruneClosedBugReports(db, new Date('2025-06-01T00:00:00Z'));
			expect(removed).toBe(2);
			const remaining = await db.select({ id: bugReports.id }).from(bugReports);
			expect(remaining.map((row) => row.id).sort()).toEqual(
				[openOld.id, closedOldCreatedRecentResolved.id, closedRecent.id].sort()
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
			now: first
		});
		let [row] = await db.select().from(unmatchedPhrases);
		expect({ count: row.count, sample: row.sample, matched: row.matched }).toEqual({
			count: 1,
			sample: 'book dentist',
			matched: '{"title":"Book dentist"}'
		});
		expect(row.createdAt.getTime()).toBe(first.getTime());
		expect(row.updatedAt.getTime()).toBe(first.getTime());

		const second = new Date('2026-03-02T09:00:00Z');
		await upsertUnmatchedPhrase(db, {
			source: 'event_parse',
			phrase: 'book dentist',
			matched: null,
			now: second
		});
		[row] = await db.select().from(unmatchedPhrases);
		expect(row.count).toBe(2);
		expect(row.sample).toBe('book dentist');
		expect(row.createdAt.getTime()).toBe(first.getTime());
		expect(row.updatedAt.getTime()).toBe(second.getTime());
		// No sample supplied: the first parse sample survives.
		expect(row.matched).toBe('{"title":"Book dentist"}');

		const third = new Date('2026-03-03T09:00:00Z');
		await upsertUnmatchedPhrase(db, {
			source: 'event_parse',
			phrase: 'book dentist',
			matched: '{"title":"Second"}',
			now: third
		});
		[row] = await db.select().from(unmatchedPhrases);
		expect(row.count).toBe(3);
		expect(row.matched).toBe('{"title":"Second"}');
		expect(row.updatedAt.getTime()).toBe(third.getTime());
	});

	rollbackTest('upsertUnmatchedPhrase keeps the two sources apart', async (db) => {
		const now = new Date('2026-03-01T09:00:00Z');
		await upsertUnmatchedPhrase(db, {
			source: 'event_parse',
			phrase: 'every tuesday',
			matched: null,
			now
		});
		await upsertUnmatchedPhrase(db, {
			source: 'bulk_edit',
			phrase: 'every tuesday',
			matched: null,
			now
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
			now: new Date('2026-03-01T09:00:00Z')
		});
		const [row] = await db.select().from(unmatchedPhrases);
		expect(row.matched).toBeNull();
	});

	rollbackTest('listOpenUnmatchedPhrases orders by count then first seen', async (db) => {
		await seedUnmatchedPhrase(db, {
			source: 'event_parse',
			phrase: 'call mom',
			sample: 'call mom',
			count: 1,
			createdAt: new Date('2026-03-02T09:00:00Z')
		});
		await seedUnmatchedPhrase(db, {
			source: 'event_parse',
			phrase: 'book dentist',
			sample: 'book dentist',
			count: 3,
			createdAt: new Date('2026-03-01T09:00:00Z')
		});
		await seedUnmatchedPhrase(db, {
			source: 'event_parse',
			phrase: 'old but popular',
			sample: 'old but popular',
			count: 3,
			createdAt: new Date('2026-02-25T09:00:00Z')
		});
		await seedUnmatchedPhrase(db, {
			source: 'bulk_edit',
			phrase: 'every tuesday',
			sample: 'every tuesday',
			count: 5,
			resolved: true
		});

		const open = await listOpenUnmatchedPhrases(db);
		expect(open.map((row) => row.phrase)).toEqual([
			'book dentist',
			'old but popular',
			'call mom'
		]);
	});

	rollbackTest('listResolvedUnmatchedPhrases keeps only resolved rows', async (db) => {
		await seedUnmatchedPhrase(db, { phrase: 'call mom', sample: 'call mom' });
		const resolved = await seedUnmatchedPhrase(db, {
			source: 'bulk_edit',
			phrase: 'every tuesday',
			sample: 'every tuesday',
			count: 5,
			resolved: true
		});

		const rows = await listResolvedUnmatchedPhrases(db);
		expect(rows.map((row) => row.id)).toEqual([resolved.id]);
	});

	rollbackTest('resolveUnmatchedPhrase stamps resolved and the caller now', async (db) => {
		const phrase = await seedUnmatchedPhrase(db);
		const now = new Date('2026-04-01T12:00:00Z');
		const row = await resolveUnmatchedPhrase(db, phrase.id, now);
		expect(row?.resolved).toBe(true);
		expect(row?.updatedAt.getTime()).toBe(now.getTime());
		const [stored] = await db
			.select()
			.from(unmatchedPhrases)
			.where(eq(unmatchedPhrases.id, phrase.id));
		expect(stored.resolved).toBe(true);
		expect(stored.updatedAt.getTime()).toBe(now.getTime());
	});

	rollbackTest('resolveUnmatchedPhrase returns null for an unknown id', async (db) => {
		expect(
			await resolveUnmatchedPhrase(db, 'missing-phrase', new Date('2026-04-01T12:00:00Z'))
		).toBeNull();
	});

	rollbackTest('countOpenUnmatchedPhrases counts unresolved rows only', async (db) => {
		await seedUnmatchedPhrase(db);
		await seedUnmatchedPhrase(db, { phrase: 'call mom', sample: 'call mom' });
		await seedUnmatchedPhrase(db, {
			phrase: 'every tuesday',
			sample: 'every tuesday',
			resolved: true
		});
		expect(await countOpenUnmatchedPhrases(db)).toBe(2);
	});

	rollbackTest(
		'pruneResolvedUnmatchedPhrases deletes resolved rows before the cutoff only',
		async (db) => {
			const unresolvedOld = await seedUnmatchedPhrase(db, {
				phrase: 'never resolved',
				sample: 'never resolved',
				createdAt: new Date('2020-01-01T00:00:00Z'),
				updatedAt: new Date('2020-01-01T00:00:00Z')
			});
			const resolvedOld = await seedUnmatchedPhrase(db, {
				phrase: 'resolved long ago',
				sample: 'resolved long ago',
				resolved: true,
				updatedAt: new Date('2020-02-01T00:00:00Z')
			});
			const resolvedRecent = await seedUnmatchedPhrase(db, {
				phrase: 'resolved recently',
				sample: 'resolved recently',
				resolved: true,
				updatedAt: new Date('2026-05-01T00:00:00Z')
			});

			const removed = await pruneResolvedUnmatchedPhrases(
				db,
				new Date('2025-06-01T00:00:00Z')
			);
			expect(removed).toBe(1);
			const remaining = await db.select({ id: unmatchedPhrases.id }).from(unmatchedPhrases);
			expect(remaining.map((row) => row.id).sort()).toEqual(
				[unresolvedOld.id, resolvedRecent.id].sort()
			);
			expect(remaining.map((row) => row.id)).not.toContain(resolvedOld.id);
		}
	);
});
