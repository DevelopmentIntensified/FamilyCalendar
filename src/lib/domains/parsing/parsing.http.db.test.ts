/**
 * Golden contract for `POST /api/parse-event`, the parsing module's only
 * `/api` route. Runs against the legacy route today and unchanged after the
 * port; every expected value is one the legacy suites already pin
 * (`src/lib/server/services/naturalLanguageService.test.ts`, its hyphen-range
 * and recurrence tables, and the route's own `server.test.ts`) — no NLP output
 * here is derived by hand.
 *
 * Doc: ./README.md#how-to-test, docs/rewrite/playbooks/characterize-endpoints.md
 */
import { DateTime } from 'luxon';
import { beforeEach, describe, expect, it } from 'vitest';
import { invoke } from '$lib/kernel/testing/invokeHandlers.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { testDb, truncateAll } from '$lib/kernel/testing/testDb.server';
// Import the ROUTE module, not the parser: the route is what clients hit, and
// after the port it re-exports the new handler, so this import never changes.
import { POST as postParseEvent } from '../../../routes/api/parse-event/+server';

const PATH = '/api/parse-event';

const ctx = () => testCtx({ db: testDb() });

/**
 * The parse fields these goldens pin; the route returns a few more. Required,
 * JSON-safe members only, so the `res.body as …` assertions stay comparable
 * with the kernel's `JsonValue` (a field the route omits reads as undefined).
 */
type WireEvent = {
	title: string;
	date: string;
	startTime: string;
	endTime: string;
	location: string;
	attendants: string[];
	recurring: string;
	recurringByDay: string[];
};

type SingleBody = { method: string; confidence: number; parsed: WireEvent };
type ListBody = { method: string; results: Array<{ parsed: WireEvent; confidence: number }> };

/** Weekday of an ISO date (1 = Monday … 7 = Sunday), like the legacy tests. */
function weekday(iso: string): number {
	return DateTime.fromISO(iso).weekday;
}

async function parseAnonymously(input: string): Promise<SingleBody> {
	const res = await invoke(postParseEvent, { ctx: ctx(), path: PATH, body: { input } });
	expect(res.status).toBe(200);
	return res.body as SingleBody;
}

describe('POST /api/parse-event — refusals', () => {
	beforeEach(truncateAll);

	it('answers 400 "Input required" when input is absent', async () => {
		const res = await invoke(postParseEvent, { ctx: ctx(), path: PATH, body: {} });
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'Input required' });
	});

	it('answers 400 "Input required" when input is null', async () => {
		const res = await invoke(postParseEvent, { ctx: ctx(), path: PATH, body: { input: null } });
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'Input required' });
	});

	it('answers 400 "Input required" when input is an empty string', async () => {
		const res = await invoke(postParseEvent, { ctx: ctx(), path: PATH, body: { input: '' } });
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'Input required' });
	});

	it('answers 400 "Input required" when input is whitespace only', async () => {
		const res = await invoke(postParseEvent, {
			ctx: ctx(),
			path: PATH,
			body: { input: '   \t ' }
		});
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'Input required' });
	});

	it('answers 400 "Input required" when input is not a string', async () => {
		const res = await invoke(postParseEvent, { ctx: ctx(), path: PATH, body: { input: 42 } });
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'Input required' });
	});
});

describe('POST /api/parse-event — local regex parse (anonymous callers)', () => {
	beforeEach(truncateAll);

	it('titles "dinner friday" as "dinner" on the next Friday', async () => {
		const body = await parseAnonymously('dinner friday');
		expect(body.method).toBe('regex');
		expect(body.confidence).toEqual(expect.any(Number));
		expect(body.parsed.title).toBe('dinner');
		expect(weekday(body.parsed.date ?? '')).toBe(5);
	});

	it('reads a plural weekday as a weekly series ("yoga on tuesdays at 6pm")', async () => {
		const body = await parseAnonymously('yoga on tuesdays at 6pm');
		expect(body.parsed).toMatchObject({ recurring: 'weekly', startTime: '18:00' });
		expect(weekday(body.parsed.date ?? '')).toBe(2);
	});

	it('parses the priced event card: title, short location, leading meridiem time', async () => {
		const body = await parseAnonymously(
			'PM Certification 4 Days Classroom Training in Lynchburg, VA Tue, May 26 • 9:00 AM Lynchburg, VA From $1,659.95'
		);
		expect(body).toMatchObject({
			method: 'regex',
			parsed: {
				title: 'PM Certification 4 Days Classroom Training',
				location: 'Lynchburg',
				startTime: '09:00'
			}
		});
	});

	it('keeps the explicit year on a day-first date ("launch 21 Mar 2027")', async () => {
		const body = await parseAnonymously('launch 21 Mar 2027');
		expect(body.parsed.date).toBe('2027-03-21');
	});

	it('keeps the explicit year after a month and ordinal ("reunion July 12th 2027")', async () => {
		const body = await parseAnonymously('reunion July 12th 2027');
		expect(body.parsed.date).toBe('2027-07-12');
	});

	it('propagates the end meridiem across a hyphen range ("meeting 5:30-6:30pm")', async () => {
		const body = await parseAnonymously('meeting 5:30-6:30pm');
		expect(body.parsed).toMatchObject({ startTime: '17:30', endTime: '18:30' });
	});

	it('stores "every other week" as the canonical biweekly cadence', async () => {
		const body = await parseAnonymously('payday every other week');
		expect(body.parsed.recurring).toBe('biweekly');
	});

	it('keeps every-N days distinct from biweekly ("medication every 3 days")', async () => {
		const body = await parseAnonymously('medication every 3 days');
		expect(body.parsed.recurring).toBe('every_3_days');
	});

	it('reads a "with" list as attendants ("coffee with John")', async () => {
		const body = await parseAnonymously('coffee with John');
		expect(body.parsed.attendants).toContain('John');
	});

	it('reads "at my <place>" as the location ("game night at my apartment")', async () => {
		const body = await parseAnonymously('game night at my apartment');
		expect(body.parsed.location).toBe('Apartment');
	});
});

describe('POST /api/parse-event — cloud gating', () => {
	beforeEach(truncateAll);

	it('never reports a cloud parse for an anonymous caller', async () => {
		const body = await parseAnonymously('dinner tomorrow at 6pm');
		expect(body.method).toBe('regex');
	});

	it('stays on the local parser for an anonymous caller that asks for the cloud', async () => {
		const res = await invoke(postParseEvent, {
			ctx: ctx(),
			path: PATH,
			body: { input: 'dinner tomorrow at 6pm', useCloud: true }
		});
		expect(res.status).toBe(200);
		expect((res.body as SingleBody).method).toBe('regex');
	});

	it('keeps a signed-in caller on the local parser when useCloud is false', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(postParseEvent, {
			ctx: ctx(),
			user,
			path: PATH,
			body: { input: 'dinner tomorrow at 6pm', useCloud: false }
		});
		expect(res.status).toBe(200);
		expect((res.body as SingleBody).method).toBe('regex');
	});
});

describe('POST /api/parse-event — multi-event shortcut answers {results, method}', () => {
	beforeEach(truncateAll);

	it('splits a semicolon list into three dated results and drops top-level confidence', async () => {
		const res = await invoke(postParseEvent, {
			ctx: ctx(),
			path: PATH,
			body: { input: 'yoga Monday; dentist Tuesday; call mom Wednesday' }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ results: expect.any(Array), method: 'regex-list' });
		const results = (res.body as ListBody).results;
		expect(results).toHaveLength(3);
		expect(results.map((r) => weekday(r.parsed.date))).toEqual([1, 2, 3]);
	});

	it('splits "dinner Friday and movie Saturday" into the two named weekdays', async () => {
		const res = await invoke(postParseEvent, {
			ctx: ctx(),
			path: PATH,
			body: { input: 'dinner Friday and movie Saturday' }
		});
		const results = (res.body as ListBody).results;
		expect((res.body as ListBody).method).toBe('regex-list');
		expect(results).toHaveLength(2);
		expect(results.map((r) => weekday(r.parsed.date))).toEqual([5, 6]);
	});

	it('does not split an "and" list without schedule words ("fish and chips Friday")', async () => {
		const body = await parseAnonymously('fish and chips Friday');
		expect(body.method).toBe('regex');
		expect(body).not.toHaveProperty('results');
	});

	it('answers the list for a signed-in caller without a cloud parse', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(postParseEvent, {
			ctx: ctx(),
			user,
			path: PATH,
			body: { input: 'dinner Friday and movie Saturday' }
		});
		expect((res.body as ListBody).method).toBe('regex-list');
		expect((res.body as ListBody).results).toHaveLength(2);
	});
});
