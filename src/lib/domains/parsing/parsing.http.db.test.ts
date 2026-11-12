/**
 * Golden contract for `POST /api/parse-event`, the parsing module's only
 * `/api` route. Runs against the legacy route today and unchanged after the
 * port.
 *
 * Every expected value is traced by hand from the legacy code — the route
 * (`src/routes/api/parse-event/+server.ts`) and the parser
 * (`src/lib/server/services/naturalLanguageService.ts`). Where a legacy
 * assertion already pins the same behaviour it is cited in the test title or
 * the row label (`naturalLanguageService.test.ts`, `parserClaimGuards.test.ts`,
 * the route's own `server.test.ts`); the rest are traced from the code alone,
 * because the legacy suite only asserted fragments of these bodies.
 *
 * Success bodies are WHOLE and exact (`toEqual`, no `expect.any`): every key
 * the route emits, including `allDay`, `description`, `recurringByDay`,
 * `dates` and per-entry `confidence` in list results, and nothing else. The
 * only computed values are clock-derived dates, built from `DateTime.now()` in
 * the zone the caller resolves in — the way the legacy suite does it
 * (`naturalLanguageService.test.ts:669-674`) — so "today" and "tomorrow"
 * differ instead of both passing a weekday check.
 *
 * Doc: ./README.md#how-to-test, docs/rewrite/playbooks/characterize-endpoints.md
 */
import { DateTime } from 'luxon';
import { beforeEach, describe, expect, it } from 'vitest';
import { userSettings } from '$lib/kernel/db/tables.server';
import { invoke } from '$lib/kernel/testing/invokeHandlers.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { testDb, truncateAll } from '$lib/kernel/testing/testDb.server';
import type { JsonValue } from '$lib/kernel/validation/validators';
// Import the ROUTE module, not the parser: the route is what clients hit, and
// after the port it re-exports the new handler, so this import never changes.
import { POST as postParseEvent } from '../../../routes/api/parse-event/+server';

const PATH = '/api/parse-event';

const ctx = () => testCtx({ db: testDb() });

/** A single parse answer: the whole body the wire carries. */
type SingleBody = {
	parsed: Record<string, unknown>;
	confidence: number;
	method: string;
};

/** Today in the zone the parser resolved the caller in (`DateTime.now()` is server-local). */
function today(now: DateTime): string {
	return now.toFormat('yyyy-MM-dd');
}

/** Tomorrow in that zone (`naturalLanguageService.ts:576-582`). */
function tomorrow(now: DateTime): string {
	return now.plus({ days: 1 }).toFormat('yyyy-MM-dd');
}

/**
 * The next strictly-future date on a weekday (1 = Monday … 7 = Sunday).
 * `getNextDayOfWeek` (`naturalLanguageService.ts:65-75`) rolls today to +7.
 */
function nextWeekday(weekday: number, now: DateTime): string {
	const delta = weekday - now.weekday;
	return now.plus({ days: delta <= 0 ? delta + 7 : delta }).toFormat('yyyy-MM-dd');
}

/**
 * A bare month-day with the shared rollover rule
 * (`dateResolution.ts:73-98`): this year, or next year when the day sits
 * strictly before today.
 */
function nextMonthDay(month: number, day: number, now: DateTime): string {
	const target = DateTime.fromObject(
		{ year: now.year, month, day },
		{ zone: now.zoneName ?? undefined }
	);
	const resolved = target < now.startOf('day') ? target.plus({ years: 1 }) : target;
	return resolved.toFormat('yyyy-MM-dd');
}

/** One local-parse phrase and its whole expected body. */
type PhraseCase = {
	readonly label: string;
	readonly input: string;
	/** `now` is the server-local clock the legacy code reads. */
	readonly body: (now: DateTime) => SingleBody;
};

/**
 * The ten single-event phrase goldens. Every row's full body is traced from
 * the legacy code; labels cite the legacy assertion where one exists.
 */
const phraseCases: PhraseCase[] = [
	{
		label: '"dinner friday" — bare-weekday fallback, title "dinner" (legacy: resolves "dinner friday")',
		input: 'dinner friday',
		body: (now) => ({
			parsed: { allDay: false, date: nextWeekday(5, now), title: 'dinner' },
			confidence: 0.4,
			method: 'regex'
		})
	},
	{
		label: '"yoga on tuesdays at 6pm" — a plural weekday is a weekly series (legacy: Plural weekday recurrence)',
		input: 'yoga on tuesdays at 6pm',
		body: (now) => ({
			parsed: {
				allDay: false,
				date: nextWeekday(2, now),
				startTime: '18:00',
				title: 'yoga',
				recurring: 'weekly',
				recurringByDay: ['TU']
			},
			confidence: 0.65,
			method: 'regex'
		})
	},
	{
		label: 'priced event card — leading meridiem title, short place, 09:00 (legacy: bare leading meridiem, issue 107)',
		input:
			'PM Certification 4 Days Classroom Training in Lynchburg, VA Tue, May 26 • 9:00 AM Lynchburg, VA From $1,659.95',
		body: (now) => ({
			parsed: {
				allDay: false,
				date: nextMonthDay(5, 26, now),
				startTime: '09:00',
				location: 'Lynchburg',
				title: 'PM Certification 4 Days Classroom Training'
			},
			confidence: 0.9000000000000001,
			method: 'regex'
		})
	},
	{
		label: '"launch 21 Mar 2027" — day-first keeps the explicit year (legacy: day-first with year)',
		input: 'launch 21 Mar 2027',
		body: () => ({
			parsed: { allDay: false, date: '2027-03-21', title: 'launch' },
			confidence: 0.5,
			method: 'regex'
		})
	},
	{
		label: '"reunion July 12th 2027" — month-day keeps the explicit year (legacy: year suffix)',
		input: 'reunion July 12th 2027',
		body: () => ({
			parsed: { allDay: false, date: '2027-07-12', title: 'reunion' },
			confidence: 0.5,
			method: 'regex'
		})
	},
	{
		label: '"meeting 5:30-6:30pm" — the end meridiem propagates (legacy: hyphen range)',
		input: 'meeting 5:30-6:30pm',
		body: (now) => ({
			parsed: {
				allDay: false,
				date: today(now),
				startTime: '17:30',
				endTime: '18:30',
				title: 'meeting'
			},
			confidence: 0.4,
			method: 'regex'
		})
	},
	{
		label: '"payday every other week" — biweekly, and the title keeps its trailing space',
		input: 'payday every other week',
		body: (now) => ({
			parsed: { allDay: false, date: today(now), title: 'payday ', recurring: 'biweekly' },
			confidence: 0.4,
			method: 'regex'
		})
	},
	{
		label: '"medication every 3 days" — every-N stays distinct from biweekly',
		input: 'medication every 3 days',
		body: (now) => ({
			parsed: { allDay: false, date: today(now), title: 'medication ', recurring: 'every_3_days' },
			confidence: 0.4,
			method: 'regex'
		})
	},
	{
		label: '"coffee with John" — the terminal with-list leaves the title',
		input: 'coffee with John',
		body: (now) => ({
			parsed: { allDay: false, date: today(now), title: 'coffee ', attendants: ['John'] },
			confidence: 0.35,
			method: 'regex'
		})
	},
	{
		label: '"game night at my apartment" — "at my X" reads the place (legacy: parses "at my apartment")',
		input: 'game night at my apartment',
		body: (now) => ({
			parsed: { allDay: false, date: today(now), location: 'Apartment', title: 'game night' },
			confidence: 0.30000000000000004,
			method: 'regex'
		})
	}
];

type RefusalCase = {
	readonly label: string;
	readonly body: JsonValue;
};

/** The five shapes of a missing/blank/non-string `input` (`+server.ts:66-70`). */
const refusalCases: RefusalCase[] = [
	{ label: 'input absent', body: {} },
	{ label: 'input null', body: { input: null } },
	{ label: 'input empty string', body: { input: '' } },
	{ label: 'input whitespace only', body: { input: '   \t ' } },
	{ label: 'input not a string', body: { input: 42 } }
];

/** Seed a signed-in caller whose stored zone the route reads (`userTimezone.ts:16-18`). */
async function seedZonedUser(timeZone: string) {
	const user = await seedUser(testDb());
	await testDb().insert(userSettings).values({ userId: user.id, timeZone });
	return user;
}

describe('POST /api/parse-event — refusals', () => {
	beforeEach(truncateAll);

	it.each(refusalCases)('answers 400 "Input required" when $label', async ({ body }) => {
		const res = await invoke(postParseEvent, { ctx: ctx(), path: PATH, body });
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'Input required' });
	});
});

describe('POST /api/parse-event — local regex parse (anonymous callers)', () => {
	beforeEach(truncateAll);

	it.each(phraseCases)('$label', async ({ input, body }) => {
		const res = await invoke(postParseEvent, { ctx: ctx(), path: PATH, body: { input } });
		expect(res.status).toBe(200);
		expect(res.body).toEqual(body(DateTime.now()));
	});

	it('keeps a 2+ date chain in dates[] with date = dates[0] ("book club sept 5, 12, and 19")', async () => {
		const res = await invoke(postParseEvent, {
			ctx: ctx(),
			path: PATH,
			body: { input: 'book club sept 5, 12, and 19' }
		});
		// Continuations borrow the month/year of the nearest preceding date
		// (`naturalLanguageService.ts:773-857`), so only the first atom rolls over.
		const first = nextMonthDay(9, 5, DateTime.now());
		const year = first.slice(0, 4);
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			parsed: {
				allDay: false,
				date: first,
				dates: [first, `${year}-09-12`, `${year}-09-19`],
				title: 'book club'
			},
			confidence: 0.5,
			method: 'regex'
		});
	});
});

describe('POST /api/parse-event — cloud gating', () => {
	beforeEach(truncateAll);

	/** "dinner tomorrow at 6pm" on the local parser, in server-local time. */
	const dinnerTomorrowAt6 = (now: DateTime): SingleBody => ({
		parsed: { allDay: false, date: tomorrow(now), startTime: '18:00', title: 'dinner' },
		confidence: 0.65,
		method: 'regex'
	});

	it('never reports a cloud parse for an anonymous caller', async () => {
		const res = await invoke(postParseEvent, {
			ctx: ctx(),
			path: PATH,
			body: { input: 'dinner tomorrow at 6pm' }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual(dinnerTomorrowAt6(DateTime.now()));
	});

	it('stays on the local parser for an anonymous caller that asks for the cloud', async () => {
		const res = await invoke(postParseEvent, {
			ctx: ctx(),
			path: PATH,
			body: { input: 'dinner tomorrow at 6pm', useCloud: true }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual(dinnerTomorrowAt6(DateTime.now()));
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
		expect(res.body).toEqual(dinnerTomorrowAt6(DateTime.now()));
	});

	it('treats useCloud:null as false (the default applies only when the key is absent)', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(postParseEvent, {
			ctx: ctx(),
			user,
			path: PATH,
			body: { input: 'dinner tomorrow at 6pm', useCloud: null }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual(dinnerTomorrowAt6(DateTime.now()));
	});

	it('answers the local parse for a signed-in caller with useCloud absent (no LLM configured in tests)', async () => {
		// `llmConfigured()` is false without CEREBRAS_API_KEY (`llm.ts:7`), so the
		// cloud branch cannot run here; S5 pins the branch itself.
		const user = await seedUser(testDb());
		const res = await invoke(postParseEvent, {
			ctx: ctx(),
			user,
			path: PATH,
			body: { input: 'dinner tomorrow at 6pm' }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual(dinnerTomorrowAt6(DateTime.now()));
	});
});

describe('POST /api/parse-event — the zone at the wire', () => {
	beforeEach(truncateAll);

	it("resolves 'tomorrow' in the caller's stored zone (Pacific/Kiritimati)", async () => {
		const user = await seedZonedUser('Pacific/Kiritimati');
		const res = await invoke(postParseEvent, {
			ctx: ctx(),
			user,
			path: PATH,
			body: { input: 'meeting tomorrow' }
		});
		const zoned = DateTime.now().setZone('Pacific/Kiritimati');
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			parsed: { allDay: false, date: zoned.plus({ days: 1 }).toFormat('yyyy-MM-dd'), title: 'meeting' },
			confidence: 0.4,
			method: 'regex'
		});
	});

	it('resolves an anonymous "tomorrow" in server-local time', async () => {
		const res = await invoke(postParseEvent, {
			ctx: ctx(),
			path: PATH,
			body: { input: 'meeting tomorrow' }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			parsed: { allDay: false, date: tomorrow(DateTime.now()), title: 'meeting' },
			confidence: 0.4,
			method: 'regex'
		});
	});

	it('falls back to server-local time when the stored zone is invalid', async () => {
		// `zoneFromSettings` drops an IANA name luxon rejects (`userTimezone.ts:11-13`).
		const user = await seedZonedUser('Not/AZone');
		const res = await invoke(postParseEvent, {
			ctx: ctx(),
			user,
			path: PATH,
			body: { input: 'meeting tomorrow' }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			parsed: { allDay: false, date: tomorrow(DateTime.now()), title: 'meeting' },
			confidence: 0.4,
			method: 'regex'
		});
	});

	it('defaults an unmatched date to today in the caller zone', async () => {
		const user = await seedZonedUser('Pacific/Kiritimati');
		const res = await invoke(postParseEvent, {
			ctx: ctx(),
			user,
			path: PATH,
			body: { input: 'dentist appointment' }
		});
		const zoned = DateTime.now().setZone('Pacific/Kiritimati');
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			parsed: { allDay: false, date: zoned.toFormat('yyyy-MM-dd'), title: 'dentist appointment' },
			confidence: 0.2,
			method: 'regex'
		});
	});
});

describe("POST /api/parse-event — today's accidental behaviours, pinned as they are", () => {
	beforeEach(truncateAll);

	it('keeps the stated 18:00 on a "birthday" phrase (allDay is set; 09:00–17:00 only without a start time)', async () => {
		const res = await invoke(postParseEvent, {
			ctx: ctx(),
			path: PATH,
			body: { input: 'birthday party at 6pm' }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			parsed: {
				allDay: true,
				date: today(DateTime.now()),
				startTime: '18:00',
				title: 'birthday party'
			},
			confidence: 0.6000000000000001,
			method: 'regex'
		});
	});

	it('reads the singular abbreviation "tues" as a plural weekday, so one event becomes weekly', async () => {
		const res = await invoke(postParseEvent, {
			ctx: ctx(),
			path: PATH,
			body: { input: 'lunch tues' }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			parsed: {
				allDay: false,
				date: nextWeekday(2, DateTime.now()),
				title: 'lunch ',
				recurring: 'weekly',
				recurringByDay: ['TU']
			},
			confidence: 0.4,
			method: 'regex'
		});
	});

	it('writes the literal "Invalid DateTime" for an impossible MM/DD ("party 31/12")', async () => {
		const res = await invoke(postParseEvent, {
			ctx: ctx(),
			path: PATH,
			body: { input: 'party 31/12' }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			parsed: { allDay: false, date: 'Invalid DateTime', title: 'party 31/12' },
			confidence: 0.5,
			method: 'regex'
		});
	});

	it('reads a clock-like time inside a URL, even though the URL is excluded from title and date scans', async () => {
		const url = 'https://meet.example.com/standup-5:30pm';
		const res = await invoke(postParseEvent, {
			ctx: ctx(),
			path: PATH,
			body: { input: `${url} standup` }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			parsed: {
				allDay: false,
				date: today(DateTime.now()),
				startTime: '17:30',
				title: 'standup',
				description: url
			},
			confidence: 0.45,
			method: 'regex'
		});
	});

	it('has no input length cap: a 2000-character phrase still answers 200', async () => {
		const res = await invoke(postParseEvent, {
			ctx: ctx(),
			path: PATH,
			body: { input: 'z'.repeat(2000) }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			parsed: { allDay: false, date: today(DateTime.now()), title: 'z'.repeat(50) },
			confidence: 0.2,
			method: 'regex'
		});
	});

	it('lets malformed JSON escape the error boundary instead of answering the 400 shape', async () => {
		// `await request.json()` runs before the `try` (`+server.ts:67,96`).
		await expect(
			invoke(postParseEvent, { ctx: ctx(), path: PATH, rawBody: '{"input": ' })
		).rejects.toThrow(SyntaxError);
	});

	it('lets a JSON null body throw before the error boundary instead of answering 400', async () => {
		await expect(invoke(postParseEvent, { ctx: ctx(), path: PATH, body: null })).rejects.toThrow(
			TypeError
		);
	});
});

describe('POST /api/parse-event — multi-event shortcut answers {results, method}', () => {
	beforeEach(truncateAll);

	it('splits a semicolon list into three dated results, each with its own confidence', async () => {
		const res = await invoke(postParseEvent, {
			ctx: ctx(),
			path: PATH,
			body: { input: 'yoga Monday; dentist Tuesday; call mom Wednesday' }
		});
		const now = DateTime.now();
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			results: [
				{
					parsed: { allDay: false, date: nextWeekday(1, now), title: 'yoga' },
					confidence: 0.4
				},
				{
					parsed: { allDay: false, date: nextWeekday(2, now), title: 'dentist' },
					confidence: 0.4
				},
				{
					parsed: { allDay: false, date: nextWeekday(3, now), title: 'call mom' },
					confidence: 0.4
				}
			],
			method: 'regex-list'
		});
	});

	it('splits "dinner Friday and movie Saturday" into the two named weekdays', async () => {
		const res = await invoke(postParseEvent, {
			ctx: ctx(),
			path: PATH,
			body: { input: 'dinner Friday and movie Saturday' }
		});
		const now = DateTime.now();
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			results: [
				{
					parsed: { allDay: false, date: nextWeekday(5, now), title: 'dinner' },
					confidence: 0.4
				},
				{
					parsed: { allDay: false, date: nextWeekday(6, now), title: 'movie' },
					confidence: 0.4
				}
			],
			method: 'regex-list'
		});
	});

	it('does not split an "and" list without schedule words ("fish and chips Friday")', async () => {
		const res = await invoke(postParseEvent, {
			ctx: ctx(),
			path: PATH,
			body: { input: 'fish and chips Friday' }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			parsed: {
				allDay: false,
				date: nextWeekday(5, DateTime.now()),
				title: 'fish and chips'
			},
			confidence: 0.4,
			method: 'regex'
		});
	});

	it('answers the list for a signed-in caller', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(postParseEvent, {
			ctx: ctx(),
			user,
			path: PATH,
			body: { input: 'dinner Friday and movie Saturday' }
		});
		const now = DateTime.now();
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			results: [
				{
					parsed: { allDay: false, date: nextWeekday(5, now), title: 'dinner' },
					confidence: 0.4
				},
				{
					parsed: { allDay: false, date: nextWeekday(6, now), title: 'movie' },
					confidence: 0.4
				}
			],
			method: 'regex-list'
		});
	});
});
