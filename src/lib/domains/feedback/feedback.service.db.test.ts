/**
 * feedback services against real Postgres: one test per IO Invariant, titled
 * after the rule. Each test runs in `rollbackTest`, and `testCtx({ db })`
 * supplies the clock, limiter and log fakes, so nothing here reads the
 * process clock or a module-scope throttle map.
 *
 * Doc: ./README.md#how-to-test
 */
import { eq, sql } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import { actorFromUser } from '$lib/kernel/ctx/actor';
import { bugReports, unmatchedPhrases } from '$lib/kernel/db/tables.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { BUG_REPORT_INVALID_MESSAGE } from './feedback.contract';
import { seedBugReport, seedUnmatchedPhrase } from './feedback.fixtures.server';
import {
	countOpenFeedback,
	fileAutoBugReport,
	fileBugReport,
	listFeedback,
	pruneFeedbackOlderThan,
	reportUnmatchedPhrase,
	resolveFeedback
} from './feedback.service.server';

const NOW = '2026-03-01T09:00:00.000Z';

describe('fileBugReport', () => {
	rollbackTest('stores the report under the actor, trimmed and capped', async (db) => {
		const user = await seedUser(db);
		const ctx = testCtx({ db, now: NOW });
		const filed = await fileBugReport(ctx, actorFromUser(user, 'session'), {
			area: 'tasks',
			description: '  Row vanished  ',
			url: `  https://example.test/${'a'.repeat(2100)}  `
		});
		const [row] = await db.select().from(bugReports).where(eq(bugReports.id, filed.id));
		expect(filed.id).toBe(row.id);
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
			url: `https://example.test/${'a'.repeat(2100)}`.slice(0, 2000),
			status: 'open',
			resolvedAt: null
		});
	});

	rollbackTest('refuses a description that is blank after trimming', async (db) => {
		const user = await seedUser(db);
		const ctx = testCtx({ db, now: NOW });
		await expect(
			fileBugReport(ctx, actorFromUser(user, 'session'), {
				area: 'tasks',
				description: '   ',
				url: null
			})
		).rejects.toMatchObject({ code: 'invalid', message: BUG_REPORT_INVALID_MESSAGE });
		expect(await db.select().from(bugReports)).toEqual([]);
	});
});

describe('fileAutoBugReport', () => {
	rollbackTest('files a fault for a signed-in caller', async (db) => {
		const user = await seedUser(db);
		const ctx = testCtx({ db, now: NOW });
		await fileAutoBugReport(ctx, {
			status: 500,
			message: 'Boom happened',
			path: '/calendar/day',
			userId: user.id
		});
		const rows = await db.select().from(bugReports);
		expect(rows.map((row) => ({
			userId: row.userId,
			area: row.area,
			description: row.description,
			url: row.url
		}))).toEqual([
			{
				userId: user.id,
				area: 'calendar',
				description: '[auto-filed 500] Boom happened',
				url: '/calendar/day'
			}
		]);
	});

	rollbackTest('never files for an anonymous caller', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		// #153: a crash reachable without a session is attacker noise, not a signal.
		await fileAutoBugReport(ctx, {
			status: 500,
			message: 'Boom happened',
			path: '/calendar/day',
			userId: null
		});
		expect(await db.select().from(bugReports)).toEqual([]);
	});

	rollbackTest('skips 404s, blank messages and client aborts', async (db) => {
		const user = await seedUser(db);
		const ctx = testCtx({ db, now: NOW });
		for (const fault of [
			{ status: 404, message: 'Not found', path: '/calendar/day', userId: user.id },
			{ status: 500, message: '   ', path: '/calendar/day', userId: user.id },
			{ status: 500, message: 'Client aborted the request', path: '/tasks', userId: user.id }
		]) {
			await fileAutoBugReport(ctx, fault);
		}
		expect(await db.select().from(bugReports)).toEqual([]);
	});

	rollbackTest('files one auto report per failure key per ten minutes', async (db) => {
		const user = await seedUser(db);
		const ctx = testCtx({ db, now: NOW });
		const fault = {
			status: 500,
			message: 'Boom happened',
			path: '/calendar/day',
			userId: user.id
		};
		await fileAutoBugReport(ctx, fault);
		await fileAutoBugReport(ctx, fault);
		expect(await db.select().from(bugReports)).toHaveLength(1);
		ctx.clock.advanceMs(10 * 60 * 1000);
		await fileAutoBugReport(ctx, fault);
		expect(await db.select().from(bugReports)).toHaveLength(2);
	});

	rollbackTest('never throws when the write fails', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		// A reporter that does not exist violates the users foreign key.
		await expect(
			fileAutoBugReport(ctx, {
				status: 500,
				message: 'Boom happened',
				path: '/calendar/day',
				userId: 'missing-user'
			})
		).resolves.toBeUndefined();
		expect(ctx.log.entries).toContainEqual(
			expect.objectContaining({ level: 'warn', event: 'auto_bug_report_failed' })
		);
	});
});

describe('reportUnmatchedPhrase', () => {
	rollbackTest('stores the normalized phrase with the caller now', async (db) => {
		const user = await seedUser(db);
		const ctx = testCtx({ db, now: NOW });
		await reportUnmatchedPhrase(ctx, actorFromUser(user, 'session'), {
			phrase: 'Book dentist  tomorrow',
			source: 'event_parse',
			matched: { title: 'Book dentist' }
		});
		const rows = await db.select().from(unmatchedPhrases);
		expect(
			rows.map((row) => ({
				source: row.source,
				phrase: row.phrase,
				sample: row.sample,
				matched: row.matched,
				count: row.count,
				resolved: row.resolved,
				createdAt: row.createdAt.toISOString(),
				updatedAt: row.updatedAt.toISOString()
			}))
		).toEqual([
			{
				source: 'event_parse',
				phrase: 'book dentist tomorrow',
				sample: 'book dentist tomorrow',
				matched: '{"title":"Book dentist"}',
				count: 1,
				resolved: false,
				createdAt: NOW,
				updatedAt: NOW
			}
		]);
	});

	rollbackTest('bumps the count and leaves the stored sample alone when none is supplied', async (db) => {
		const user = await seedUser(db);
		const ctx = testCtx({ db, now: NOW });
		const actor = actorFromUser(user, 'session');
		await reportUnmatchedPhrase(ctx, actor, {
			phrase: 'call mom',
			source: 'event_parse',
			matched: { title: 'Call mom' }
		});
		ctx.clock.advanceMs(60 * 1000);
		await reportUnmatchedPhrase(ctx, actor, { phrase: 'CALL  mom', source: 'event_parse' });
		const rows = await db.select().from(unmatchedPhrases);
		expect(rows.map((row) => [row.phrase, row.count, row.matched, row.updatedAt.toISOString()])).toEqual([
			['call mom', 2, '{"title":"Call mom"}', '2026-03-01T09:01:00.000Z']
		]);
	});

	rollbackTest('swallows a storage failure and logs it', async (db) => {
		const user = await seedUser(db);
		const ctx = testCtx({ db, now: NOW });
		// Abort the test transaction; the next statement fails without a fake db.
		await expect(db.execute(sql`select 1 / 0`)).rejects.toThrow();
		await expect(
			reportUnmatchedPhrase(ctx, actorFromUser(user, 'session'), {
				phrase: 'call mom',
				source: 'event_parse'
			})
		).resolves.toBeUndefined();
		expect(ctx.log.entries).toContainEqual(
			expect.objectContaining({ level: 'warn', event: 'unmatched_phrase_report_failed' })
		);
	});
});

describe('listFeedback', () => {
	rollbackTest('answers the open and resolved bug registers with reporter names', async (db) => {
		const admin = await seedUser(db, { roles: ['admin'] });
		const reporter = await seedUser(db, { firstName: 'Mia', lastName: 'Ng' });
		await seedBugReport(db, { userId: reporter.id, description: 'Still open' });
		await seedBugReport(db, {
			userId: reporter.id,
			description: 'Already closed',
			status: 'resolved',
			resolvedAt: new Date('2026-02-01T09:00:00.000Z')
		});
		await seedBugReport(db, { description: 'Anonymous and open' });

		const register = await listFeedback(
			testCtx({ db, now: NOW }),
			actorFromUser(admin, 'session'),
			'bug'
		);
		expect(register.resolved.map((row) => row.description)).toEqual(['Already closed']);
		expect(
			register.open.map((row) => [
				row.description,
				row.reporterFirstName,
				row.reporterLastName
			])
		).toEqual(
			expect.arrayContaining([
				['Still open', 'Mia', 'Ng'],
				['Anonymous and open', null, null]
			])
		);
		expect(register.open).toHaveLength(2);
	});

	rollbackTest('answers the open and resolved phrase registers', async (db) => {
		const admin = await seedUser(db, { roles: ['admin'] });
		await seedUnmatchedPhrase(db, { phrase: 'call mom', count: 1 });
		await seedUnmatchedPhrase(db, {
			phrase: 'every tuesday',
			source: 'bulk_edit',
			resolved: true
		});

		const register = await listFeedback(
			testCtx({ db, now: NOW }),
			actorFromUser(admin, 'session'),
			'phrase'
		);
		expect(register.open.map((row) => row.phrase)).toEqual(['call mom']);
		expect(register.resolved.map((row) => row.phrase)).toEqual(['every tuesday']);
	});

	rollbackTest('refuses a signed-in non-admin', async (db) => {
		const stranger = await seedUser(db);
		await expect(
			listFeedback(testCtx({ db, now: NOW }), actorFromUser(stranger, 'session'), 'bug')
		).rejects.toMatchObject({ code: 'forbidden', message: 'Forbidden' });
	});
});

describe('resolveFeedback', () => {
	rollbackTest('closes a report with the caller now and returns the row', async (db) => {
		const admin = await seedUser(db, { roles: ['admin'] });
		const report = await seedBugReport(db);
		const row = await resolveFeedback(
			testCtx({ db, now: NOW }),
			actorFromUser(admin, 'session'),
			'bug',
			report.id
		);
		expect(row.status).toBe('resolved');
		expect(row.resolvedAt?.toISOString()).toBe(NOW);
	});

	rollbackTest('moves resolvedAt on a second resolve (Q-007)', async (db) => {
		const admin = await seedUser(db, { roles: ['admin'] });
		const report = await seedBugReport(db, {
			status: 'resolved',
			resolvedAt: new Date('2020-01-01T00:00:00.000Z')
		});
		const row = await resolveFeedback(
			testCtx({ db, now: NOW }),
			actorFromUser(admin, 'session'),
			'bug',
			report.id
		);
		expect(row.resolvedAt?.toISOString()).toBe(NOW);
	});

	rollbackTest('answers the bug-report not-found copy', async (db) => {
		const admin = await seedUser(db, { roles: ['admin'] });
		await expect(
			resolveFeedback(
				testCtx({ db, now: NOW }),
				actorFromUser(admin, 'session'),
				'bug',
				'missing-report'
			)
		).rejects.toMatchObject({ code: 'notFound', message: 'Bug report not found' });
	});

	rollbackTest('closes a phrase and re-stamps updatedAt', async (db) => {
		const admin = await seedUser(db, { roles: ['admin'] });
		const phrase = await seedUnmatchedPhrase(db);
		const row = await resolveFeedback(
			testCtx({ db, now: NOW }),
			actorFromUser(admin, 'session'),
			'phrase',
			phrase.id
		);
		expect({ resolved: row.resolved, updatedAt: row.updatedAt.toISOString() }).toEqual({
			resolved: true,
			updatedAt: NOW
		});
	});

	rollbackTest('answers the phrase not-found copy', async (db) => {
		const admin = await seedUser(db, { roles: ['admin'] });
		await expect(
			resolveFeedback(
				testCtx({ db, now: NOW }),
				actorFromUser(admin, 'session'),
				'phrase',
				'missing-phrase'
			)
		).rejects.toMatchObject({ code: 'notFound', message: 'Phrase not found' });
	});
});

describe('countOpenFeedback', () => {
	rollbackTest('counts open bugs and phrases', async (db) => {
		await seedBugReport(db, { description: 'Open one' });
		await seedBugReport(db, { description: 'Open two' });
		await seedBugReport(db, {
			description: 'Closed',
			status: 'resolved',
			resolvedAt: new Date('2026-02-01T09:00:00.000Z')
		});
		await seedUnmatchedPhrase(db, { phrase: 'call mom' });
		await seedUnmatchedPhrase(db, { phrase: 'every tuesday', resolved: true });
		expect(await countOpenFeedback(testCtx({ db, now: NOW }))).toEqual({
			bugs: 2,
			phrases: 1
		});
	});
});

describe('pruneFeedbackOlderThan', () => {
	rollbackTest('prunes only closed rows older than the cutoff', async (db) => {
		const cutoff = new Date('2026-01-01T00:00:00.000Z');
		const openOld = await seedBugReport(db, {
			description: 'Open, however old',
			createdAt: new Date('2020-01-01T00:00:00.000Z')
		});
		await seedBugReport(db, {
			description: 'Closed long ago',
			status: 'resolved',
			resolvedAt: new Date('2020-06-01T00:00:00.000Z')
		});
		await seedBugReport(db, {
			description: 'Closed without a stamp',
			status: 'resolved',
			createdAt: new Date('2020-01-01T00:00:00.000Z')
		});
		const closedRecently = await seedBugReport(db, {
			description: 'Created long ago, closed recently',
			status: 'resolved',
			createdAt: new Date('2020-01-01T00:00:00.000Z'),
			resolvedAt: new Date('2026-06-01T00:00:00.000Z')
		});
		await seedUnmatchedPhrase(db, {
			phrase: 'old resolved',
			resolved: true,
			createdAt: new Date('2020-01-01T00:00:00.000Z'),
			updatedAt: new Date('2020-01-01T00:00:00.000Z')
		});
		const busyPhrase = await seedUnmatchedPhrase(db, {
			phrase: 'recently resolved',
			resolved: true,
			updatedAt: new Date('2026-06-01T00:00:00.000Z')
		});
		const openPhrase = await seedUnmatchedPhrase(db, {
			phrase: 'still open',
			createdAt: new Date('2020-01-01T00:00:00.000Z'),
			updatedAt: new Date('2020-01-01T00:00:00.000Z')
		});

		const pruned = await pruneFeedbackOlderThan(testCtx({ db, now: NOW }), cutoff);
		expect(pruned).toEqual({ bugs: 2, phrases: 1 });
		const reportIds = (await db.select().from(bugReports)).map((row) => row.id).sort();
		expect(reportIds).toEqual([openOld.id, closedRecently.id].sort());
		const phraseIds = (await db.select().from(unmatchedPhrases)).map((row) => row.id).sort();
		expect(phraseIds).toEqual([busyPhrase.id, openPhrase.id].sort());
	});
});
