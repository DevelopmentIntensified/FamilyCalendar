/**
 * Golden contract tests for feedback's `/api` surface (S2).
 *
 * They drive the LEGACY route modules exactly as clients hit them, so every
 * assertion here must stay green after the port rewires the routes onto
 * `feedback.http.server.ts`. Committed mode (`truncateAll`): the legacy handlers
 * write through the `db` singleton, outside any test transaction.
 *
 * Doc: ./README.md#how-to-test
 */
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { bugReports, unmatchedPhrases } from '$lib/kernel/db/tables.server';
import { invoke } from '$lib/kernel/testing/invokeHandlers.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { testDb, truncateAll } from '$lib/kernel/testing/testDb.server';
import type { JsonValue } from '$lib/kernel/validation/validators';
// Import the ROUTE modules, not the legacy actions: the route is what clients
// hit, and after the port it re-exports the new handler, so this import never
// changes (docs/rewrite/playbooks/characterize-endpoints.md).
import { GET as getAdminBugs } from '../../../routes/api/admin/bugs/+server';
import { POST as postResolveBugReport } from '../../../routes/api/admin/bugs/[id]/resolve/+server';
import { GET as getAdminNlp } from '../../../routes/api/admin/nlp/+server';
import { POST as postResolvePhrase } from '../../../routes/api/admin/nlp/[id]/resolve/+server';
import { POST as postBugReport } from '../../../routes/api/bug-report/+server';
import { POST as postReportPhrase } from '../../../routes/api/report-phrase/+server';

const ctx = () => testCtx({ db: testDb() });

/** The one 400 body both report endpoints use; the wording is the wire. */
const BUG_REPORT_INVALID =
	'area (one of calendar, tasks, account, payments, dashboard, other) and description (<=5000 chars) are required';
const PHRASE_INVALID = 'phrase (string) and source (event_parse | bulk_edit) are required';

/** Generated timestamps are serialized by `json()` as ISO strings with ms. */
const isoStamp = () => expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

/** The exports stamp `Generated: YYYY-MM-DD HH:MM` (local) and each row's date. */
function maskDates(text: string): string {
	return text.replace(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/g, '<date>');
}

function exportTextOf(body: unknown): string {
	if (typeof body !== 'object' || body === null) {
		throw new Error('expected a JSON object body');
	}
	// SAFETY: `res.body` is the parsed JSON object here; only `exportText` is read.
	const record = body as { readonly [key: string]: unknown };
	const text = record.exportText;
	if (typeof text !== 'string') throw new Error('expected exportText in the body');
	return text;
}

function first<T>(rows: readonly T[]): T {
	const [row] = rows;
	if (row === undefined) throw new Error('expected at least one row');
	return row;
}

beforeEach(truncateAll);

describe('POST /api/bug-report', () => {
	it('files a report for a signed-in user and answers {success, id}', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(postBugReport, {
			ctx: ctx(),
			user,
			path: '/api/bug-report',
			headers: { 'x-real-ip': '10.1.0.1' },
			body: { area: 'tasks', description: '  Row vanished ', url: '/calendar/tasks' }
		});
		const row = first(await testDb().select().from(bugReports).where(eq(bugReports.userId, user.id)));
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true, id: row.id });
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

	it('trims the description and caps the stored url at 2000 chars', async () => {
		const user = await seedUser(testDb());
		const description = `  ${'x'.repeat(5000)}  `;
		const url = `https://example.test/${'a'.repeat(2100)}`;
		const res = await invoke(postBugReport, {
			ctx: ctx(),
			user,
			headers: { 'x-real-ip': '10.1.0.2' },
			body: { area: 'other', description, url }
		});
		expect(res.status).toBe(200);
		const row = first(await testDb().select().from(bugReports).where(eq(bugReports.userId, user.id)));
		expect(row.description).toBe('x'.repeat(5000));
		expect(row.url).toBe(url.slice(0, 2000));
	});

	it('stores an absent, null or blank url as null', async () => {
		const user = await seedUser(testDb());
		const bodies: JsonValue[] = [
			{ area: 'tasks', description: 'absent' },
			{ area: 'tasks', description: 'null', url: null },
			{ area: 'tasks', description: 'blank', url: '   ' }
		];
		for (const body of bodies) {
			const res = await invoke(postBugReport, {
				ctx: ctx(),
				user,
				headers: { 'x-real-ip': '10.1.0.3' },
				body
			});
			expect(res.status).toBe(200);
		}
		const rows = await testDb().select().from(bugReports).where(eq(bugReports.userId, user.id));
		expect(rows.map((row) => row.url)).toEqual([null, null, null]);
	});

	it('answers 400 for an unknown or differently-cased area', async () => {
		const user = await seedUser(testDb());
		for (const area of ['weather', 'Tasks']) {
			const res = await invoke(postBugReport, {
				ctx: ctx(),
				user,
				headers: { 'x-real-ip': '10.1.0.4' },
				body: { area, description: 'x' }
			});
			expect(res.status).toBe(400);
			expect(res.body).toEqual({ error: BUG_REPORT_INVALID });
		}
		expect(await testDb().select().from(bugReports)).toEqual([]);
	});

	it('answers 400 for a blank description', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(postBugReport, {
			ctx: ctx(),
			user,
			headers: { 'x-real-ip': '10.1.0.5' },
			body: { area: 'tasks', description: '   ' }
		});
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: BUG_REPORT_INVALID });
	});

	it('answers 400 for a description over 5000 chars', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(postBugReport, {
			ctx: ctx(),
			user,
			headers: { 'x-real-ip': '10.1.0.6' },
			body: { area: 'tasks', description: 'x'.repeat(5001) }
		});
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: BUG_REPORT_INVALID });
	});

	it('answers 400 for a body that is not a JSON object', async () => {
		const user = await seedUser(testDb());
		const notJson = await invoke(postBugReport, {
			ctx: ctx(),
			user,
			headers: { 'x-real-ip': '10.1.0.7' },
			rawBody: '{'
		});
		expect(notJson.status).toBe(400);
		expect(notJson.body).toEqual({ error: BUG_REPORT_INVALID });
		const arrayBody = await invoke(postBugReport, {
			ctx: ctx(),
			user,
			headers: { 'x-real-ip': '10.1.0.7' },
			body: []
		});
		expect(arrayBody.status).toBe(400);
		expect(arrayBody.body).toEqual({ error: BUG_REPORT_INVALID });
	});

	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const res = await invoke(postBugReport, {
			ctx: ctx(),
			body: { area: 'tasks', description: 'x' }
		});
		expect(res).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
		expect(await testDb().select().from(bugReports)).toEqual([]);
	});

	it('checks the session before the rate limit and throttles the sixth report per IP', async () => {
		const user = await seedUser(testDb());
		const headers = { 'x-real-ip': '10.1.0.9' };
		for (let i = 0; i < 5; i++) {
			const res = await invoke(postBugReport, {
				ctx: ctx(),
				user,
				headers,
				body: { area: 'tasks', description: `report ${i}` }
			});
			expect(res.status).toBe(200);
		}
		const throttled = await invoke(postBugReport, {
			ctx: ctx(),
			user,
			headers,
			body: { area: 'tasks', description: 'report 5' }
		});
		expect(throttled.status).toBe(429);
		expect(throttled.body).toEqual({ error: 'Too many reports. Try again shortly.' });
		// Auth runs first, so an anonymous sixth call is still a 401, not a 429.
		const anonymous = await invoke(postBugReport, {
			ctx: ctx(),
			headers,
			body: { area: 'tasks', description: 'report 6' }
		});
		expect(anonymous).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
		expect(await testDb().select().from(bugReports)).toHaveLength(5);
	});
});

describe('POST /api/report-phrase', () => {
	it('stores the normalized phrase and the match sample', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(postReportPhrase, {
			ctx: ctx(),
			user,
			path: '/api/report-phrase',
			headers: { 'x-real-ip': '10.2.0.1' },
			body: {
				phrase: 'Book dentist  tomorrow',
				source: 'event_parse',
				matched: { title: 'Book dentist' }
			}
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true });
		const row = first(await testDb().select().from(unmatchedPhrases));
		expect({
			source: row.source,
			phrase: row.phrase,
			sample: row.sample,
			matched: row.matched,
			count: row.count,
			resolved: row.resolved
		}).toEqual({
			source: 'event_parse',
			phrase: 'book dentist tomorrow',
			sample: 'book dentist tomorrow',
			matched: '{"title":"Book dentist"}',
			count: 1,
			resolved: false
		});
	});

	it('increments the count and refreshes the sample for a repeat, keeping sources apart', async () => {
		const user = await seedUser(testDb());
		const send = (source: string, matched: JsonValue) =>
			invoke(postReportPhrase, {
				ctx: ctx(),
				user,
				headers: { 'x-real-ip': '10.2.0.2' },
				body: { phrase: 'Every  Tuesday', source, matched }
			});
		expect((await send('event_parse', { title: 'first' })).status).toBe(200);
		expect((await send('event_parse', { title: 'second' })).status).toBe(200);
		expect((await send('bulk_edit', { title: 'bulk' })).status).toBe(200);
		const rows = await testDb().select().from(unmatchedPhrases);
		expect(
			rows
				.map((row) => [row.source, row.phrase, row.count, row.matched])
				.sort((a, b) => String(a[0]).localeCompare(String(b[0])))
		).toEqual([
			['bulk_edit', 'every tuesday', 1, '{"title":"bulk"}'],
			['event_parse', 'every tuesday', 2, '{"title":"second"}']
		]);
	});

	it('stores no sample when matched is absent or null', async () => {
		const user = await seedUser(testDb());
		const absent = await invoke(postReportPhrase, {
			ctx: ctx(),
			user,
			headers: { 'x-real-ip': '10.2.0.3' },
			body: { phrase: 'no sample', source: 'event_parse' }
		});
		expect(absent.status).toBe(200);
		const nullSample = await invoke(postReportPhrase, {
			ctx: ctx(),
			user,
			headers: { 'x-real-ip': '10.2.0.3' },
			body: { phrase: 'null sample', source: 'bulk_edit', matched: null }
		});
		expect(nullSample.status).toBe(200);
		const rows = await testDb().select().from(unmatchedPhrases);
		expect(rows.map((row) => row.matched)).toEqual([null, null]);
	});

	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const res = await invoke(postReportPhrase, {
			ctx: ctx(),
			body: { phrase: 'x', source: 'event_parse' }
		});
		expect(res).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
		expect(await testDb().select().from(unmatchedPhrases)).toEqual([]);
	});

	it('answers 400 for an unknown source', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(postReportPhrase, {
			ctx: ctx(),
			user,
			headers: { 'x-real-ip': '10.2.0.4' },
			body: { phrase: 'x', source: 'parser' }
		});
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: PHRASE_INVALID });
	});

	it('answers 400 for a blank phrase', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(postReportPhrase, {
			ctx: ctx(),
			user,
			headers: { 'x-real-ip': '10.2.0.5' },
			body: { phrase: '   ', source: 'event_parse' }
		});
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: PHRASE_INVALID });
	});

	it('accepts 280 chars and answers 400 at 281', async () => {
		const user = await seedUser(testDb());
		const send = (phrase: string) =>
			invoke(postReportPhrase, {
				ctx: ctx(),
				user,
				headers: { 'x-real-ip': '10.2.0.6' },
				body: { phrase, source: 'event_parse' }
			});
		expect((await send('a'.repeat(280))).status).toBe(200);
		const tooLong = await send('a'.repeat(281));
		expect(tooLong.status).toBe(400);
		expect(tooLong.body).toEqual({ error: PHRASE_INVALID });
	});

	it('refuses a whitespace-heavy phrase over 280 chars before normalizing it (Q-006)', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(postReportPhrase, {
			ctx: ctx(),
			user,
			headers: { 'x-real-ip': '10.2.0.7' },
			body: { phrase: `a${' '.repeat(280)}b`, source: 'event_parse' }
		});
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: PHRASE_INVALID });
	});

	it('throttles to 20 reports per IP per 5 minutes with 429', async () => {
		const user = await seedUser(testDb());
		const headers = { 'x-real-ip': '10.2.0.8' };
		for (let i = 0; i < 20; i++) {
			const res = await invoke(postReportPhrase, {
				ctx: ctx(),
				user,
				headers,
				body: { phrase: `phrase ${i}`, source: 'event_parse' }
			});
			expect(res.status).toBe(200);
		}
		const throttled = await invoke(postReportPhrase, {
			ctx: ctx(),
			user,
			headers,
			body: { phrase: 'phrase 20', source: 'event_parse' }
		});
		expect(throttled.status).toBe(429);
		expect(throttled.body).toEqual({ error: 'Too many reports. Try again shortly.' });
		expect(await testDb().select().from(unmatchedPhrases)).toHaveLength(20);
	});
});

describe('GET /api/admin/bugs', () => {
	it('lists open and resolved reports with reporter names and an open-only export', async () => {
		const admin = await seedUser(testDb(), { roles: ['admin'] });
		const reporter = await seedUser(testDb(), { firstName: 'Mia', lastName: 'Ng' });
		const [resolved] = await testDb()
			.insert(bugReports)
			.values({
				userId: reporter.id,
				area: 'account',
				description: 'Old fault',
				url: '/account',
				status: 'resolved',
				resolvedAt: new Date('2026-02-01T09:00:00.000Z'),
				createdAt: new Date('2026-01-01T09:00:00.000Z')
			})
			.returning();
		const [older] = await testDb()
			.insert(bugReports)
			.values({
				userId: reporter.id,
				area: 'tasks',
				description: 'Row vanished',
				url: '/calendar/tasks',
				createdAt: new Date('2026-03-01T09:00:00.000Z')
			})
			.returning();
		const [newer] = await testDb()
			.insert(bugReports)
			.values({
				userId: null,
				area: 'calendar',
				description: 'Event disappeared\nwhen I saved.',
				url: null,
				createdAt: new Date('2026-03-02T09:00:00.000Z')
			})
			.returning();

		const res = await invoke(getAdminBugs, { ctx: ctx(), user: admin, path: '/api/admin/bugs' });
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			open: [
				{
					id: newer.id,
					userId: null,
					area: 'calendar',
					description: 'Event disappeared\nwhen I saved.',
					url: null,
					status: 'open',
					resolvedAt: null,
					createdAt: isoStamp(),
					updatedAt: isoStamp(),
					reporterFirstName: null,
					reporterLastName: null
				},
				{
					id: older.id,
					userId: reporter.id,
					area: 'tasks',
					description: 'Row vanished',
					url: '/calendar/tasks',
					status: 'open',
					resolvedAt: null,
					createdAt: isoStamp(),
					updatedAt: isoStamp(),
					reporterFirstName: 'Mia',
					reporterLastName: 'Ng'
				}
			],
			resolved: [
				{
					id: resolved.id,
					userId: reporter.id,
					area: 'account',
					description: 'Old fault',
					url: '/account',
					status: 'resolved',
					resolvedAt: isoStamp(),
					createdAt: isoStamp(),
					updatedAt: isoStamp(),
					reporterFirstName: 'Mia',
					reporterLastName: 'Ng'
				}
			],
			exportText: expect.any(String)
		});
		const expectedExport = [
			'BUG REPORTS EXPORT',
			'Generated: <date>',
			'User-submitted bug reports, newest first.',
			'',
			'Open: 2',
			'='.repeat(60),
			'',
			'## Open',
			'- [Calendar] Event disappeared when I saved.  (page: n/a · <date>)',
			'- [Tasks] Row vanished  (page: /calendar/tasks · <date>)',
			''
		].join('\n');
		expect(maskDates(exportTextOf(res.body))).toBe(expectedExport);
	});

	it('answers an empty register and an empty export', async () => {
		const admin = await seedUser(testDb(), { roles: ['admin'] });
		const res = await invoke(getAdminBugs, { ctx: ctx(), user: admin, path: '/api/admin/bugs' });
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			open: [],
			resolved: [],
			exportText: expect.any(String)
		});
		const expectedExport = [
			'BUG REPORTS EXPORT',
			'Generated: <date>',
			'User-submitted bug reports, newest first.',
			'',
			'Open: 0',
			'='.repeat(60),
			''
		].join('\n');
		expect(maskDates(exportTextOf(res.body))).toBe(expectedExport);
	});

	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const res = await invoke(getAdminBugs, { ctx: ctx(), path: '/api/admin/bugs' });
		expect(res).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
	});

	it('answers 403 {"error":"Forbidden"} for a signed-in non-admin', async () => {
		const stranger = await seedUser(testDb());
		const res = await invoke(getAdminBugs, {
			ctx: ctx(),
			user: stranger,
			path: '/api/admin/bugs'
		});
		expect(res).toMatchObject({ status: 403, body: { error: 'Forbidden' } });
	});
});

describe('POST /api/admin/bugs/[id]/resolve', () => {
	it('marks the report resolved and returns the updated row', async () => {
		const admin = await seedUser(testDb(), { roles: ['admin'] });
		const reporter = await seedUser(testDb());
		const [report] = await testDb()
			.insert(bugReports)
			.values({
				userId: reporter.id,
				area: 'tasks',
				description: 'Row vanished',
				url: '/calendar/tasks'
			})
			.returning();
		const res = await invoke(postResolveBugReport, {
			ctx: ctx(),
			user: admin,
			method: 'POST',
			path: `/api/admin/bugs/${report.id}/resolve`,
			params: { id: report.id }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			success: true,
			report: {
				id: report.id,
				userId: reporter.id,
				area: 'tasks',
				description: 'Row vanished',
				url: '/calendar/tasks',
				status: 'resolved',
				resolvedAt: isoStamp(),
				createdAt: isoStamp(),
				updatedAt: isoStamp()
			}
		});
		const row = first(await testDb().select().from(bugReports).where(eq(bugReports.id, report.id)));
		expect(row.status).toBe('resolved');
		expect(row.resolvedAt).toBeInstanceOf(Date);
	});

	it('answers 404 {"error":"Bug report not found"} for an unknown id', async () => {
		const admin = await seedUser(testDb(), { roles: ['admin'] });
		const res = await invoke(postResolveBugReport, {
			ctx: ctx(),
			user: admin,
			method: 'POST',
			path: '/api/admin/bugs/missing/resolve',
			params: { id: 'missing-report' }
		});
		expect(res.status).toBe(404);
		expect(res.body).toEqual({ error: 'Bug report not found' });
	});

	it('answers 401 when signed out and 403 for a signed-in non-admin', async () => {
		const stranger = await seedUser(testDb());
		const signedOut = await invoke(postResolveBugReport, {
			ctx: ctx(),
			method: 'POST',
			path: '/api/admin/bugs/x/resolve',
			params: { id: 'x' }
		});
		expect(signedOut).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
		const forbidden = await invoke(postResolveBugReport, {
			ctx: ctx(),
			user: stranger,
			method: 'POST',
			path: '/api/admin/bugs/x/resolve',
			params: { id: 'x' }
		});
		expect(forbidden).toMatchObject({ status: 403, body: { error: 'Forbidden' } });
	});

	it('answers 200 for an already-resolved report and re-stamps resolvedAt (Q-007)', async () => {
		const admin = await seedUser(testDb(), { roles: ['admin'] });
		const [report] = await testDb()
			.insert(bugReports)
			.values({
				area: 'tasks',
				description: 'Resolved long ago',
				status: 'resolved',
				resolvedAt: new Date('2020-01-01T00:00:00.000Z')
			})
			.returning();
		const res = await invoke(postResolveBugReport, {
			ctx: ctx(),
			user: admin,
			method: 'POST',
			path: `/api/admin/bugs/${report.id}/resolve`,
			params: { id: report.id }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			success: true,
			report: {
				id: report.id,
				userId: null,
				area: 'tasks',
				description: 'Resolved long ago',
				url: null,
				status: 'resolved',
				resolvedAt: isoStamp(),
				createdAt: isoStamp(),
				updatedAt: isoStamp()
			}
		});
		const row = first(await testDb().select().from(bugReports).where(eq(bugReports.id, report.id)));
		expect(row.resolvedAt ? row.resolvedAt.getTime() : 0).toBeGreaterThan(
			Date.parse('2020-01-01T00:00:00.000Z')
		);
	});
});

describe('GET /api/admin/nlp', () => {
	it('lists open and resolved phrases with an open-only export', async () => {
		const admin = await seedUser(testDb(), { roles: ['admin'] });
		const [oneOff] = await testDb()
			.insert(unmatchedPhrases)
			.values({
				source: 'event_parse',
				phrase: 'call mom',
				sample: 'call mom',
				count: 1,
				createdAt: new Date('2026-03-02T09:00:00.000Z'),
				updatedAt: new Date('2026-03-02T09:00:00.000Z')
			})
			.returning();
		const [busy] = await testDb()
			.insert(unmatchedPhrases)
			.values({
				source: 'event_parse',
				phrase: 'book dentist',
				sample: 'book dentist',
				matched: '{"title":"Book dentist"}',
				count: 3,
				createdAt: new Date('2026-03-01T09:00:00.000Z'),
				updatedAt: new Date('2026-03-01T09:00:00.000Z')
			})
			.returning();
		const [resolved] = await testDb()
			.insert(unmatchedPhrases)
			.values({
				source: 'bulk_edit',
				phrase: 'every tuesday',
				sample: 'every tuesday',
				count: 5,
				resolved: true,
				createdAt: new Date('2026-02-01T09:00:00.000Z'),
				updatedAt: new Date('2026-02-02T09:00:00.000Z')
			})
			.returning();

		const res = await invoke(getAdminNlp, { ctx: ctx(), user: admin, path: '/api/admin/nlp' });
		expect(res.status).toBe(200);
		// The export prints the UTC date of the instant the query returned; derive it
		// from the same rows so the assertion does not depend on the host timezone.
		const busyFirstSeen = busy.createdAt.toISOString().slice(0, 10);
		const oneOffFirstSeen = oneOff.createdAt.toISOString().slice(0, 10);
		expect(res.body).toEqual({
			phrases: [
				{
					id: busy.id,
					source: 'event_parse',
					phrase: 'book dentist',
					sample: 'book dentist',
					matched: '{"title":"Book dentist"}',
					count: 3,
					resolved: false,
					createdAt: isoStamp(),
					updatedAt: isoStamp()
				},
				{
					id: oneOff.id,
					source: 'event_parse',
					phrase: 'call mom',
					sample: 'call mom',
					matched: null,
					count: 1,
					resolved: false,
					createdAt: isoStamp(),
					updatedAt: isoStamp()
				}
			],
			resolved: [
				{
					id: resolved.id,
					source: 'bulk_edit',
					phrase: 'every tuesday',
					sample: 'every tuesday',
					matched: null,
					count: 5,
					resolved: true,
					createdAt: isoStamp(),
					updatedAt: isoStamp()
				}
			],
			exportText: expect.any(String)
		});
		const expectedExport = [
			'UNMATCHED PHRASES EXPORT',
			'Generated: <date>',
			'Instructions the natural-language parsers could not handle.',
			'',
			'Open: 2 unique (4 occurrences)',
			'='.repeat(60),
			'',
			'## Event parse (2)',
			`- "book dentist" — 3x, first seen ${busyFirstSeen} matched: {"title":"Book dentist"}`,
			`- "call mom" — 1x, first seen ${oneOffFirstSeen}`,
			''
		].join('\n');
		expect(maskDates(exportTextOf(res.body))).toBe(expectedExport);
	});

	it('answers an empty register and an empty export', async () => {
		const admin = await seedUser(testDb(), { roles: ['admin'] });
		const res = await invoke(getAdminNlp, { ctx: ctx(), user: admin, path: '/api/admin/nlp' });
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			phrases: [],
			resolved: [],
			exportText: expect.any(String)
		});
		const expectedExport = [
			'UNMATCHED PHRASES EXPORT',
			'Generated: <date>',
			'Instructions the natural-language parsers could not handle.',
			'',
			'Open: 0 unique (0 occurrences)',
			'='.repeat(60),
			''
		].join('\n');
		expect(maskDates(exportTextOf(res.body))).toBe(expectedExport);
	});

	it('answers 401 when signed out and 403 for a signed-in non-admin', async () => {
		const stranger = await seedUser(testDb());
		const signedOut = await invoke(getAdminNlp, { ctx: ctx(), path: '/api/admin/nlp' });
		expect(signedOut).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
		const forbidden = await invoke(getAdminNlp, {
			ctx: ctx(),
			user: stranger,
			path: '/api/admin/nlp'
		});
		expect(forbidden).toMatchObject({ status: 403, body: { error: 'Forbidden' } });
	});
});

describe('POST /api/admin/nlp/[id]/resolve', () => {
	it('marks the phrase resolved and returns the updated row', async () => {
		const admin = await seedUser(testDb(), { roles: ['admin'] });
		const [phrase] = await testDb()
			.insert(unmatchedPhrases)
			.values({ source: 'event_parse', phrase: 'book dentist', sample: 'book dentist', count: 2 })
			.returning();
		const res = await invoke(postResolvePhrase, {
			ctx: ctx(),
			user: admin,
			method: 'POST',
			path: `/api/admin/nlp/${phrase.id}/resolve`,
			params: { id: phrase.id }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			success: true,
			phrase: {
				id: phrase.id,
				source: 'event_parse',
				phrase: 'book dentist',
				sample: 'book dentist',
				matched: null,
				count: 2,
				resolved: true,
				createdAt: isoStamp(),
				updatedAt: isoStamp()
			}
		});
		const row = first(
			await testDb().select().from(unmatchedPhrases).where(eq(unmatchedPhrases.id, phrase.id))
		);
		expect(row.resolved).toBe(true);
	});

	it('answers 404 {"error":"Phrase not found"} for an unknown id', async () => {
		const admin = await seedUser(testDb(), { roles: ['admin'] });
		const res = await invoke(postResolvePhrase, {
			ctx: ctx(),
			user: admin,
			method: 'POST',
			path: '/api/admin/nlp/missing/resolve',
			params: { id: 'missing-phrase' }
		});
		expect(res.status).toBe(404);
		expect(res.body).toEqual({ error: 'Phrase not found' });
	});

	it('answers 401 when signed out and 403 for a signed-in non-admin', async () => {
		const stranger = await seedUser(testDb());
		const signedOut = await invoke(postResolvePhrase, {
			ctx: ctx(),
			method: 'POST',
			path: '/api/admin/nlp/x/resolve',
			params: { id: 'x' }
		});
		expect(signedOut).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
		const forbidden = await invoke(postResolvePhrase, {
			ctx: ctx(),
			user: stranger,
			method: 'POST',
			path: '/api/admin/nlp/x/resolve',
			params: { id: 'x' }
		});
		expect(forbidden).toMatchObject({ status: 403, body: { error: 'Forbidden' } });
	});

	it('answers 200 again for an already-resolved phrase', async () => {
		const admin = await seedUser(testDb(), { roles: ['admin'] });
		const [phrase] = await testDb()
			.insert(unmatchedPhrases)
			.values({
				source: 'bulk_edit',
				phrase: 'every tuesday',
				sample: 'every tuesday',
				count: 1,
				resolved: true
			})
			.returning();
		const res = await invoke(postResolvePhrase, {
			ctx: ctx(),
			user: admin,
			method: 'POST',
			path: `/api/admin/nlp/${phrase.id}/resolve`,
			params: { id: phrase.id }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			success: true,
			phrase: {
				id: phrase.id,
				source: 'bulk_edit',
				phrase: 'every tuesday',
				sample: 'every tuesday',
				matched: null,
				count: 1,
				resolved: true,
				createdAt: isoStamp(),
				updatedAt: isoStamp()
			}
		});
	});
});
