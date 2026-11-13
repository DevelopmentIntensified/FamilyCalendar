/**
 * Golden contract for the calendar event endpoints (S2): exactly what a client
 * sees today from GET/POST /api/events, PUT/DELETE /api/events/[id], the rsvp
 * pair and the .ics export. Written against the legacy handlers and kept green
 * through the port, so a goldens change means the port changed the wire
 * (docs/rewrite/playbooks/characterize-endpoints.md).
 * Doc: ./README.md#how-to-test
 */
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
	calendars,
	eventAttendance,
	eventExceptions,
	events,
	families,
	familyMembers,
	userSettings
} from '$lib/kernel/db/tables.server';
import { invoke, type InvokeResult } from '$lib/kernel/testing/invokeHandlers.server';
import type { JsonValue } from '$lib/kernel/validation/validators';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { testDb, truncateAll } from '$lib/kernel/testing/testDb.server';
import {
	seedAttendanceRow,
	seedCalendarRow,
	seedEventRow,
	seedExceptionRow,
	seedRecurringEventRow,
	type CalendarEventSeed
} from './calendar.fixtures.server';
import { DELETE as deleteEvent, PUT as putEvent } from '../../../routes/api/events/[id]/+server';
import { GET as getEventIcs } from '../../../routes/api/events/[id]/ics/+server';
import { GET as getRsvp, POST as postRsvp } from '../../../routes/api/events/[id]/rsvp/+server';
import { GET as getEvents, POST as postEvents } from '../../../routes/api/events/+server';

const ctx = () => testCtx({ db: testDb() });

const PERSONAL_CAL = 'cal-personal01';
const FAMILY_CAL = 'cal-family01';
const FAMILY = 'fam-riveras01';

/** Every timestamp on the wire is a UTC ISO instant, second-precision + ms. */
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

type JsonObject = Record<string, JsonValue>;

/** A JSON object as a plain record (spreading the union body would keep its readonly shape). */
function toObject(source: object): JsonObject {
	const out: JsonObject = {};
	for (const [key, value] of Object.entries(source)) out[key] = value;
	return out;
}

/** The response body as an object; a non-object body says what came back instead. */
function objectBody(res: InvokeResult): JsonObject {
	const body = res.body;
	if (body === null || typeof body !== 'object' || Array.isArray(body)) {
		throw new Error(`expected a JSON object body, got: ${res.text.slice(0, 200)}`);
	}
	return toObject(body);
}

/** A nested object field, or a failure naming it. */
function objectValue(value: JsonValue | undefined, label: string): JsonObject {
	if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(`expected '${label}' to be an object`);
	}
	return toObject(value);
}

function arrayField(body: JsonObject, key: string): JsonValue[] {
	const value = body[key];
	if (!Array.isArray(value)) throw new Error(`expected '${key}' to be an array`);
	return [...value];
}

type EventSeed = Partial<CalendarEventSeed>;

async function seedMembership(familyId: string, userId: string) {
	await testDb().insert(familyMembers).values({ familyId, userId, role: 'member' });
}

function storedIso(value: unknown): string {
	return new Date(String(value)).toISOString();
}

beforeEach(truncateAll);

describe('GET /api/events', () => {
	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const res = await invoke(getEvents, {
			ctx: ctx(),
			query: { from: '2026-10-01', to: '2026-10-31' }
		});

		expect(res.status).toBe(401);
		expect(res.body).toEqual({ error: 'Unauthorized' });
	});

	it('serves the expanded occurrences of the requested window with rsvp, attendance and creator', async () => {
		const user = await seedUser(testDb(), { firstName: 'Mia' });
		await seedCalendarRow(PERSONAL_CAL, { ownerId: user.id });
		await seedEventRow({
			id: 'evtoneoff01',
			ownerId: user.id,
			calendarId: PERSONAL_CAL,
			title: 'Soccer practice',
			start: '2026-10-05T09:00:00.000Z',
			end: '2026-10-05T10:00:00.000Z'
		});
		await seedEventRow({
			id: 'evtweekly01',
			ownerId: user.id,
			calendarId: PERSONAL_CAL,
			title: 'Piano',
			start: '2026-10-06T15:00:00.000Z',
			end: '2026-10-06T16:00:00.000Z',
			recurrenceFrequency: 'weekly',
			recurrenceInterval: 1,
			recurrenceCount: 3
		});
		await testDb()
			.insert(eventAttendance)
			.values({ eventId: 'evtoneoff01', userId: user.id, status: 'going', inviteType: 'optional' });

		const res = await invoke(getEvents, {
			ctx: ctx(),
			user,
			query: { from: '2026-10-01', to: '2026-10-31' }
		});

		expect(res.status).toBe(200);
		const body = objectBody(res);
		expect(body.window).toEqual({ from: '2026-10-01', to: '2026-10-31' });

		// A one-off carries its composite occurrence id, RSVP + attendance summary
		// and the creator's first name (eventDisplayService.ts:99-123,135-178).
		expect(arrayField(body, 'events')[0]).toEqual({
			id: 'evtoneoff01~2026-10-05T09:00:00.000Z',
			calendarId: PERSONAL_CAL,
			ownerId: user.id,
			title: 'Soccer practice',
			start: '2026-10-05T09:00:00.000Z',
			end: '2026-10-05T10:00:00.000Z',
			description: null,
			location: null,
			allDay: false,
			recurrenceFrequency: null,
			recurrenceInterval: null,
			recurrenceByDay: null,
			recurrenceCount: null,
			recurrenceUntil: null,
			reminderMinutes: null,
			mirrorOf: null,
			created_at: expect.stringMatching(ISO),
			masterId: 'evtoneoff01',
			occurrenceDate: '2026-10-05T09:00:00.000Z',
			date: '2026-10-05T09:00:00.000Z',
			rsvpStatus: 'going',
			attendance: { going: 1, invited: 1, required: 0, requiredPending: 0, goingNames: ['Mia'] },
			creatorName: 'Mia'
		});

		// A Recurring Event expands into one occurrence per slot, each keyed to the
		// master and the recurrence slot (= its start until an Exception Override).
		expect(arrayField(body, 'events')[1]).toEqual({
			id: 'evtweekly01~2026-10-06T15:00:00.000Z',
			calendarId: PERSONAL_CAL,
			ownerId: user.id,
			title: 'Piano',
			start: '2026-10-06T15:00:00.000Z',
			end: '2026-10-06T16:00:00.000Z',
			description: null,
			location: null,
			allDay: false,
			recurrenceFrequency: 'weekly',
			recurrenceInterval: 1,
			recurrenceByDay: null,
			recurrenceCount: 3,
			recurrenceUntil: null,
			reminderMinutes: null,
			mirrorOf: null,
			created_at: expect.stringMatching(ISO),
			masterId: 'evtweekly01',
			occurrenceDate: '2026-10-06T15:00:00.000Z',
			date: '2026-10-06T15:00:00.000Z',
			creatorName: 'Mia'
		});
		expect(
			arrayField(body, 'events')
				.slice(1)
				.map((event) => String(objectValue(event, 'event')['id']))
		).toEqual([
			'evtweekly01~2026-10-06T15:00:00.000Z',
			'evtweekly01~2026-10-13T15:00:00.000Z',
			'evtweekly01~2026-10-20T15:00:00.000Z'
		]);
	});

	it('reads every calendar the viewer belongs to, and hides everyone else (issue 098)', async () => {
		const viewer = await seedUser(testDb(), { firstName: 'Mia' });
		const partner = await seedUser(testDb(), { firstName: 'Sam' });
		const stranger = await seedUser(testDb(), { firstName: 'Ari' });
		await testDb().insert(families).values({ id: FAMILY, name: 'Riveras' });
		await seedMembership(FAMILY, viewer.id);
		await seedMembership(FAMILY, partner.id);
		await seedCalendarRow(PERSONAL_CAL, { ownerId: viewer.id });
		await seedCalendarRow(FAMILY_CAL, { familyId: FAMILY });
		await seedCalendarRow('cal-stranger1', { ownerId: stranger.id });
		await seedEventRow({
			id: 'evtpartner1',
			ownerId: partner.id,
			calendarId: FAMILY_CAL,
			title: 'Family dinner',
			start: '2026-10-09T18:00:00.000Z'
		});
		await seedEventRow({
			id: 'evtstrange1',
			ownerId: stranger.id,
			calendarId: 'cal-stranger1',
			title: 'Not mine',
			start: '2026-10-10T18:00:00.000Z'
		});

		const res = await invoke(getEvents, {
			ctx: ctx(),
			user: viewer,
			query: { from: '2026-10-01', to: '2026-10-31' }
		});

		expect(res.status).toBe(200);
		expect(arrayField(objectBody(res), 'events')).toEqual([
			expect.objectContaining({
				id: 'evtpartner1~2026-10-09T18:00:00.000Z',
				title: 'Family dinner',
				creatorName: 'Sam'
			})
		]);
	});

	it('asks for both ends of the range', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(getEvents, {
			ctx: ctx(),
			user,
			query: { from: '2026-10-01' }
		});

		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'Ask for a range: ?from=YYYY-MM-DD&to=YYYY-MM-DD.' });
	});

	it('refuses a date that does not exist instead of rolling it over', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(getEvents, {
			ctx: ctx(),
			user,
			query: { from: '2026-02-31', to: '2026-03-05' }
		});

		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'Ask for a range: ?from=YYYY-MM-DD&to=YYYY-MM-DD.' });
	});

	it('refuses a backwards range', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(getEvents, {
			ctx: ctx(),
			user,
			query: { from: '2026-10-31', to: '2026-10-01' }
		});

		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'Ask for a range: ?from=YYYY-MM-DD&to=YYYY-MM-DD.' });
	});

	it('serves a range of exactly 62 days and refuses anything wider', async () => {
		const user = await seedUser(testDb());
		const widest = await invoke(getEvents, {
			ctx: ctx(),
			user,
			query: { from: '2026-10-01', to: '2026-12-02' }
		});
		expect(widest.status).toBe(200);
		expect(objectBody(widest).window).toEqual({ from: '2026-10-01', to: '2026-12-02' });
		expect(objectBody(widest).events).toEqual([]);

		const wider = await invoke(getEvents, {
			ctx: ctx(),
			user,
			query: { from: '2026-10-01', to: '2026-12-03' }
		});
		expect(wider.status).toBe(400);
		expect(wider.body).toEqual({ error: 'That range is wider than 62 days.' });
	});

	// The expansion window is `from 00:00Z − 7d` through `to 23:59:59.999Z + 7d`
	// (eventRange.ts:76-77), so the grid week straddling the range still renders.
	it('serves the ±7-day padding around the range and drops what lies beyond it', async () => {
		const user = await seedUser(testDb());
		await seedCalendarRow(PERSONAL_CAL, { ownerId: user.id });
		// Ends the day before the padded window opens.
		await seedEventRow({
			id: 'evtoutside01',
			ownerId: user.id,
			calendarId: PERSONAL_CAL,
			title: 'Before the padding',
			start: '2026-09-23T22:00:00.000Z',
			end: '2026-09-23T23:00:00.000Z'
		});
		// Exactly on the padded window's first instant.
		await seedEventRow({
			id: 'evtpadding01',
			ownerId: user.id,
			calendarId: PERSONAL_CAL,
			title: 'On the padding edge',
			start: '2026-09-24T00:00:00.000Z',
			end: '2026-09-24T01:00:00.000Z'
		});
		await seedEventRow({
			id: 'evtpadding02',
			ownerId: user.id,
			calendarId: PERSONAL_CAL,
			title: 'Inside the padding',
			start: '2026-09-28T09:00:00.000Z',
			end: '2026-09-28T10:00:00.000Z'
		});

		const res = await invoke(getEvents, {
			ctx: ctx(),
			user,
			query: { from: '2026-10-01', to: '2026-10-31' }
		});

		expect(res.status).toBe(200);
		const body = objectBody(res);
		expect(body.window).toEqual({ from: '2026-10-01', to: '2026-10-31' });
		expect(
			arrayField(body, 'events').map((event) => String(objectValue(event, 'event')['id']))
		).toEqual([
			'evtpadding01~2026-09-24T00:00:00.000Z',
			'evtpadding02~2026-09-28T09:00:00.000Z'
		]);
	});

	// Response order is the masters' start order (`orderBy(events.start)`) and,
	// inside a master, its occurrences in order (eventDisplayService.ts:91-126) —
	// NOT chronology: a series' second slot comes before a one-off that falls
	// between the two slots.
	it('orders by master start then by occurrence, not chronologically', async () => {
		const user = await seedUser(testDb());
		await seedCalendarRow(PERSONAL_CAL, { ownerId: user.id });
		// Inserted first, so the order cannot be the insertion order.
		await seedEventRow({
			id: 'evtlater001',
			ownerId: user.id,
			calendarId: PERSONAL_CAL,
			title: 'Dentist',
			start: '2026-10-08T12:00:00.000Z',
			end: '2026-10-08T13:00:00.000Z'
		});
		await seedRecurringEventRow({
			id: 'evtseries01',
			ownerId: user.id,
			calendarId: PERSONAL_CAL,
			title: 'Piano',
			start: '2026-10-05T09:00:00.000Z',
			end: '2026-10-05T10:00:00.000Z',
			count: 2
		});

		const res = await invoke(getEvents, {
			ctx: ctx(),
			user,
			query: { from: '2026-10-01', to: '2026-10-31' }
		});

		expect(res.status).toBe(200);
		expect(
			arrayField(objectBody(res), 'events').map((event) =>
				String(objectValue(event, 'event')['id'])
			)
		).toEqual([
			'evtseries01~2026-10-05T09:00:00.000Z',
			'evtseries01~2026-10-12T09:00:00.000Z',
			'evtlater001~2026-10-08T12:00:00.000Z'
		]);
	});

	// A multi-day Event becomes one row per calendar day with the SAME composite
	// id and the same end; each row's `date`/`start` is that day's shifted start
	// (eventDisplay.ts:49-73, #224).
	it('splits a multi-day event into one entry per day, all carrying the same id', async () => {
		const user = await seedUser(testDb());
		await seedCalendarRow(PERSONAL_CAL, { ownerId: user.id });
		await seedEventRow({
			id: 'evtmulti0001',
			ownerId: user.id,
			calendarId: PERSONAL_CAL,
			title: 'Camping',
			start: '2026-10-05T22:00:00.000Z',
			end: '2026-10-07T02:00:00.000Z'
		});

		const res = await invoke(getEvents, {
			ctx: ctx(),
			user,
			query: { from: '2026-10-01', to: '2026-10-31' }
		});

		expect(res.status).toBe(200);
		const days = arrayField(objectBody(res), 'events').map((event) => {
			const row = objectValue(event, 'event');
			return {
				id: row['id'],
				masterId: row['masterId'],
				occurrenceDate: row['occurrenceDate'],
				start: row['start'],
				end: row['end'],
				date: row['date']
			};
		});
		expect(days).toEqual([
			{
				id: 'evtmulti0001~2026-10-05T22:00:00.000Z',
				masterId: 'evtmulti0001',
				occurrenceDate: '2026-10-05T22:00:00.000Z',
				start: '2026-10-05T22:00:00.000Z',
				end: '2026-10-07T02:00:00.000Z',
				date: '2026-10-05T22:00:00.000Z'
			},
			{
				id: 'evtmulti0001~2026-10-05T22:00:00.000Z',
				masterId: 'evtmulti0001',
				occurrenceDate: '2026-10-05T22:00:00.000Z',
				start: '2026-10-06T22:00:00.000Z',
				end: '2026-10-07T02:00:00.000Z',
				date: '2026-10-06T22:00:00.000Z'
			},
			{
				id: 'evtmulti0001~2026-10-05T22:00:00.000Z',
				masterId: 'evtmulti0001',
				occurrenceDate: '2026-10-05T22:00:00.000Z',
				start: '2026-10-07T22:00:00.000Z',
				end: '2026-10-07T02:00:00.000Z',
				date: '2026-10-07T22:00:00.000Z'
			}
		]);
	});

	// #215: BYDAY is a LOCAL weekday. 02:00Z on Oct 6 is Monday 19:00 in Los
	// Angeles, so BYDAY=MO starts there; read in UTC it is a Tuesday and the
	// first slot would be a week later. Instants step in UTC, so 02:00Z holds
	// across the Nov 1 DST change (19:00 PDT becomes 18:00 PST).
	it("reads BYDAY in the viewer's zone while stepping instants in UTC (DST drift)", async () => {
		const user = await seedUser(testDb());
		await testDb()
			.insert(userSettings)
			.values({ userId: user.id, timeZone: 'America/Los_Angeles' });
		await seedCalendarRow(PERSONAL_CAL, { ownerId: user.id });
		await seedEventRow({
			id: 'evtbyday001',
			ownerId: user.id,
			calendarId: PERSONAL_CAL,
			title: 'Piano',
			start: '2026-10-06T02:00:00.000Z',
			end: '2026-10-06T03:00:00.000Z',
			recurrenceFrequency: 'weekly',
			recurrenceInterval: 1,
			recurrenceByDay: ['MO'],
			recurrenceCount: 6
		});

		const res = await invoke(getEvents, {
			ctx: ctx(),
			user,
			query: { from: '2026-10-01', to: '2026-11-30' }
		});

		expect(res.status).toBe(200);
		expect(
			arrayField(objectBody(res), 'events').map((event) =>
				String(objectValue(event, 'event')['id'])
			)
		).toEqual([
			'evtbyday001~2026-10-06T02:00:00.000Z',
			'evtbyday001~2026-10-13T02:00:00.000Z',
			'evtbyday001~2026-10-20T02:00:00.000Z',
			'evtbyday001~2026-10-27T02:00:00.000Z',
			'evtbyday001~2026-11-03T02:00:00.000Z',
			'evtbyday001~2026-11-10T02:00:00.000Z'
		]);
	});

	// A date-only `recurrenceUntil` never reaches the end-of-day branch on the
	// wire: the column is `timestamp with time zone` with `mode:'string'`
	// (calendar.tables.server.ts:99-102), so Postgres stores `2026-10-20` as
	// the INSTANT 2026-10-20T00:00Z (UTC session) and reads it back as a full
	// timestamp. `recurrenceUntil()` only takes its date-only branch when the
	// value still matches /^\d{4}-\d{2}-\d{2}$/ on the raw row
	// (recurrenceService.ts:160-192), so here it is an exact cutoff: the Oct 20
	// slot is dropped and the Oct 19 one is kept. Read as end-of-day in the
	// viewer's zone the cutoff would be 2026-10-21T06:59:59.999Z and BOTH slots
	// would survive, so this fixture tells the two rules apart. (The slot is
	// 11:00–12:00 in Los Angeles, i.e. inside one calendar day, so the
	// multi-day split in eventDisplay.ts:49-73 does not add rows.)
	it('cuts at a date-only recurrenceUntil stored as a UTC-midnight instant', async () => {
		const user = await seedUser(testDb());
		await testDb()
			.insert(userSettings)
			.values({ userId: user.id, timeZone: 'America/Los_Angeles' });
		await seedCalendarRow(PERSONAL_CAL, { ownerId: user.id });
		await seedEventRow({
			id: 'evtuntil001',
			ownerId: user.id,
			calendarId: PERSONAL_CAL,
			title: 'Wind down',
			start: '2026-10-19T18:00:00.000Z',
			end: '2026-10-19T19:00:00.000Z',
			recurrenceFrequency: 'daily',
			recurrenceInterval: 1,
			recurrenceUntil: '2026-10-20'
		});

		const res = await invoke(getEvents, {
			ctx: ctx(),
			user,
			query: { from: '2026-10-15', to: '2026-10-31' }
		});

		expect(res.status).toBe(200);
		expect(
			arrayField(objectBody(res), 'events').map((event) => {
				const row = objectValue(event, 'event');
				return { id: row['id'], start: row['start'], end: row['end'], date: row['date'] };
			})
		).toEqual([
			{
				id: 'evtuntil001~2026-10-19T18:00:00.000Z',
				start: '2026-10-19T18:00:00.000Z',
				end: '2026-10-19T19:00:00.000Z',
				date: '2026-10-19T18:00:00.000Z'
			}
		]);
	});
});

describe('POST /api/events', () => {
	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const res = await invoke(postEvents, {
			ctx: ctx(),
			body: { title: 'Dentist', start: '2026-10-07T13:00:00.000Z' }
		});

		expect(res.status).toBe(401);
		expect(res.body).toEqual({ error: 'Unauthorized' });
	});

	it('creates on the personal calendar, auto-RSVPs the creator and stores guest names', async () => {
		const user = await seedUser(testDb(), { firstName: 'Mia' });
		await seedCalendarRow(PERSONAL_CAL, { ownerId: user.id });

		const res = await invoke(postEvents, {
			ctx: ctx(),
			user,
			path: '/api/events',
			headers: { 'x-real-ip': '10.2.0.1' },
			body: {
				title: 'Dentist',
				start: '2026-10-07T13:00:00.000Z',
				attendants: ['Grandma', '   ']
			}
		});

		expect(res.status).toBe(201);
		// The response is the raw drizzle row: timestamptz columns come back in
		// Postgres's own text render, not as ISO (mode:'string' passes it through).
		expect(res.body).toEqual({
			success: true,
			event: {
				id: expect.stringMatching(/^[a-z0-9]{15}$/),
				calendarId: PERSONAL_CAL,
				ownerId: user.id,
				title: 'Dentist',
				start: '2026-10-07 13:00:00+00',
				end: null,
				description: null,
				location: null,
				allDay: false,
				recurrenceFrequency: null,
				recurrenceInterval: null,
				recurrenceByDay: null,
				recurrenceCount: null,
				recurrenceUntil: null,
				reminderMinutes: null,
				mirrorOf: null,
				created_at: expect.stringMatching(ISO)
			}
		});

		const attendance = await testDb().select().from(eventAttendance);
		expect(attendance).toHaveLength(2);
		expect(attendance).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ userId: user.id, name: null, status: 'going', inviteType: 'optional' }),
				expect.objectContaining({ userId: null, name: 'Grandma', status: 'undecided', inviteType: 'optional' })
			])
		);
	});

	it('prefers structured attendees: a known member becomes a member invite, an unknown id is dropped', async () => {
		const user = await seedUser(testDb(), { firstName: 'Mia' });
		const partner = await seedUser(testDb(), { firstName: 'Sam' });
		await testDb().insert(families).values({ id: FAMILY, name: 'Riveras' });
		await seedMembership(FAMILY, user.id);
		await seedMembership(FAMILY, partner.id);
		await seedCalendarRow(PERSONAL_CAL, { ownerId: user.id });

		const res = await invoke(postEvents, {
			ctx: ctx(),
			user,
			path: '/api/events',
			body: {
				title: 'Recital',
				start: '2026-10-09T16:00:00.000Z',
				attendees: [
					{ value: partner.id, isUser: true, inviteType: 'required' },
					{ value: 'nobody-known', isUser: true },
					{ value: 'Grandma', isUser: false }
				]
			}
		});

		expect(res.status).toBe(201);
		const attendance = await testDb().select().from(eventAttendance);
		expect(attendance).toHaveLength(3);
		expect(attendance).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ userId: user.id, status: 'going' }),
				expect.objectContaining({ userId: partner.id, status: 'undecided', inviteType: 'required' }),
				expect.objectContaining({ userId: null, name: 'Grandma', inviteType: 'optional' })
			])
		);
	});

	it('mirrors the creation onto the family calendar when the setting is on', async () => {
		const user = await seedUser(testDb(), { firstName: 'Mia' });
		await testDb().insert(families).values({ id: FAMILY, name: 'Riveras' });
		await seedMembership(FAMILY, user.id);
		await seedCalendarRow(PERSONAL_CAL, { ownerId: user.id });
		await seedCalendarRow(FAMILY_CAL, { familyId: FAMILY });
		await testDb()
			.insert(userSettings)
			.values({ userId: user.id, syncEventsToFamilyCalendar: true });

		const res = await invoke(postEvents, {
			ctx: ctx(),
			user,
			path: '/api/events',
			body: { title: 'Recital', start: '2026-10-09T16:00:00.000Z' }
		});

		expect(res.status).toBe(201);
		const rows = await testDb()
			.select({
				id: events.id,
				calendarId: events.calendarId,
				mirrorOf: events.mirrorOf,
				title: events.title,
				start: events.start
			})
			.from(events);
		expect(rows).toHaveLength(2);
		const master = rows.find((row) => row.calendarId === PERSONAL_CAL);
		const mirror = rows.find((row) => row.calendarId === FAMILY_CAL);
		expect(mirror?.mirrorOf).toBe(master?.id);
		expect(mirror?.title).toBe('Recital');
		expect(storedIso(mirror?.start)).toBe('2026-10-09T16:00:00.000Z');
	});

	// Q-043 (flip-ready): the copy is made even when the family has TWO
	// calendars, and the handler takes `familyCals[0]` from an unordered select
	// (`src/routes/api/events/+server.ts:133-148`). Only ONE copy exists, so the
	// target is whichever calendar came first — not part of the contract. The
	// owner's fix (mirror only a personal-calendar Event when the family has
	// exactly one calendar) must flip this to a single row.
	it('mirrors a personal-calendar creation once when the family has two calendars (Q-043)', async () => {
		const user = await seedUser(testDb(), { firstName: 'Mia' });
		await testDb().insert(families).values({ id: FAMILY, name: 'Riveras' });
		await seedMembership(FAMILY, user.id);
		await seedCalendarRow(PERSONAL_CAL, { ownerId: user.id });
		await seedCalendarRow(FAMILY_CAL, { familyId: FAMILY });
		await seedCalendarRow('cal-family02', { familyId: FAMILY });
		await testDb()
			.insert(userSettings)
			.values({ userId: user.id, syncEventsToFamilyCalendar: true });

		const res = await invoke(postEvents, {
			ctx: ctx(),
			user,
			path: '/api/events',
			body: {
				title: 'Recital',
				start: '2026-10-09T16:00:00.000Z',
				attendants: ['Grandma']
			}
		});

		expect(res.status).toBe(201);
		const rows = await testDb().select().from(events);
		expect(rows).toHaveLength(2);
		const master = rows.find((row) => row.mirrorOf === null);
		const mirrors = rows.filter((row) => row.mirrorOf !== null);
		expect(mirrors).toHaveLength(1);
		const [mirror] = mirrors;
		expect([FAMILY_CAL, 'cal-family02']).toContain(mirror?.calendarId);
		expect(mirror).toEqual(
			expect.objectContaining({
				ownerId: user.id,
				title: 'Recital',
				mirrorOf: master?.id,
				recurrenceFrequency: null
			})
		);
		expect(storedIso(mirror?.start)).toBe('2026-10-09T16:00:00.000Z');

		// The copy is a full Event write: its own creator RSVP plus the same
		// guest invite (createEvent runs for the mirror with the master's invites).
		const mirrorAttendance = await testDb()
			.select()
			.from(eventAttendance)
			.where(eq(eventAttendance.eventId, String(mirror?.id)));
		expect(mirrorAttendance).toHaveLength(2);
		expect(mirrorAttendance).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					userId: user.id,
					name: null,
					status: 'going',
					inviteType: 'optional'
				}),
				expect.objectContaining({
					userId: null,
					name: 'Grandma',
					status: 'undecided',
					inviteType: 'optional'
				})
			])
		);
	});

	// Q-043 (flip-ready), the other half: an Event created ON a family calendar
	// is copied onto `familyCals[0]` — the first row of an UNORDERED select —
	// unless that row is the Event's own calendar (`+server.ts:136-142`). Both
	// whether a copy exists and where it lands are therefore heap facts, not
	// contract, so the golden re-derives `[0]` with the same query and pins the
	// RULE: own calendar → no copy; anything else → exactly one copy on it.
	// Usual heap order puts `cal-family02` first, so the copy exists today and
	// Q-043 (never mirror a family-calendar Event) must make this fail visibly.
	it('mirrors an event created on another family calendar onto familyCals[0] (Q-043)', async () => {
		const user = await seedUser(testDb(), { firstName: 'Mia' });
		await testDb().insert(families).values({ id: FAMILY, name: 'Riveras' });
		await seedMembership(FAMILY, user.id);
		await seedCalendarRow(PERSONAL_CAL, { ownerId: user.id });
		await seedCalendarRow('cal-family02', { familyId: FAMILY });
		await seedCalendarRow(FAMILY_CAL, { familyId: FAMILY });
		await testDb()
			.insert(userSettings)
			.values({ userId: user.id, syncEventsToFamilyCalendar: true });

		const res = await invoke(postEvents, {
			ctx: ctx(),
			user,
			path: '/api/events',
			body: {
				title: 'Practice',
				start: '2026-10-09T16:00:00.000Z',
				calendarId: FAMILY_CAL
			}
		});

		expect(res.status).toBe(201);
		const rows = await testDb().select().from(events);
		const master = rows.find((row) => row.calendarId === FAMILY_CAL);
		expect(master).toEqual(expect.objectContaining({ title: 'Practice', mirrorOf: null }));
		const mirrors = rows.filter((row) => row.mirrorOf !== null);

		// The handler's own pick, read the same way: no ORDER BY.
		const [firstFamilyCalendar] = await testDb()
			.select()
			.from(calendars)
			.where(eq(calendars.familyId, FAMILY));

		if (firstFamilyCalendar?.id === FAMILY_CAL) {
			// The pick landed on the Event's own calendar: the guard skips the copy.
			expect(rows).toHaveLength(1);
			expect(mirrors).toEqual([]);
			return;
		}
		expect(rows).toHaveLength(2);
		expect(mirrors).toHaveLength(1);
		expect(mirrors[0]?.calendarId).toBe(firstFamilyCalendar?.id);
		expect(mirrors[0]?.mirrorOf).toBe(master?.id);
		expect(mirrors[0]?.title).toBe('Practice');
	});

	it('does not mirror when the setting is off', async () => {
		const user = await seedUser(testDb());
		await seedCalendarRow(PERSONAL_CAL, { ownerId: user.id });

		await invoke(postEvents, {
			ctx: ctx(),
			user,
			path: '/api/events',
			body: { title: 'Recital', start: '2026-10-09T16:00:00.000Z' }
		});

		expect(await testDb().select({ id: events.id }).from(events)).toHaveLength(1);
	});

	it("refuses a calendar the viewer cannot see with 403 'Calendar not accessible'", async () => {
		const user = await seedUser(testDb());
		const stranger = await seedUser(testDb());
		await seedCalendarRow(PERSONAL_CAL, { ownerId: user.id });
		await seedCalendarRow('cal-stranger1', { ownerId: stranger.id });

		const res = await invoke(postEvents, {
			ctx: ctx(),
			user,
			path: '/api/events',
			body: { title: 'Recital', start: '2026-10-09T16:00:00.000Z', calendarId: 'cal-stranger1' }
		});

		expect(res.status).toBe(403);
		expect(res.body).toEqual({ error: 'Calendar not accessible' });
		expect(await testDb().select({ id: events.id }).from(events)).toEqual([]);
	});

	// Pinned as today: this handler reads `request.json()` unguarded, so a body
	// that is not JSON raises out of it (a framework 500) instead of the import
	// routes' `400 {"error":"Invalid JSON"}`.
	it('raises on a body that is not JSON instead of answering 400', async () => {
		const user = await seedUser(testDb());
		await seedCalendarRow(PERSONAL_CAL, { ownerId: user.id });

		await expect(
			invoke(postEvents, { ctx: ctx(), user, path: '/api/events', rawBody: '{' })
		).rejects.toThrow();
		expect(await testDb().select({ id: events.id }).from(events)).toEqual([]);
	});

	it('answers 500 {"error":"Failed to create event"} when the row cannot be written', async () => {
		const user = await seedUser(testDb());
		await seedCalendarRow(PERSONAL_CAL, { ownerId: user.id });

		const res = await invoke(postEvents, {
			ctx: ctx(),
			user,
			path: '/api/events',
			headers: { 'x-real-ip': '10.2.0.9' },
			body: { start: '2026-10-07T13:00:00.000Z' }
		});

		expect(res.status).toBe(500);
		expect(res.body).toEqual({ error: 'Failed to create event' });
	});
});

describe('PUT /api/events/[id]', () => {
	const EVENT = 'evtoneoff01';
	const START = '2026-10-07T13:00:00.000Z';
	const END = '2026-10-07T14:00:00.000Z';

	async function seedOwnedEvent(overrides: Partial<EventSeed> = {}) {
		const user = await seedUser(testDb(), { firstName: 'Mia' });
		await seedCalendarRow(PERSONAL_CAL, { ownerId: user.id });
		await seedEventRow({
			id: EVENT,
			ownerId: user.id,
			calendarId: PERSONAL_CAL,
			title: 'Dentist',
			start: START,
			end: END,
			description: 'Bring forms',
			location: 'Clinic',
			reminderMinutes: 30,
			...overrides
		});
		return user;
	}

	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const res = await invoke(putEvent, {
			ctx: ctx(),
			method: 'PUT',
			params: { id: EVENT },
			body: { title: 'Renamed' }
		});

		expect(res.status).toBe(401);
		expect(res.body).toEqual({ error: 'Unauthorized' });
	});

	it('keeps omitted fields and clears an explicit null or empty string (#228)', async () => {
		const user = await seedOwnedEvent();

		const res = await invoke(putEvent, {
			ctx: ctx(),
			user,
			method: 'PUT',
			params: { id: EVENT },
			body: { location: '', description: null, reminderMinutes: null }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			success: true,
			event: {
				id: EVENT,
				calendarId: PERSONAL_CAL,
				ownerId: user.id,
				title: 'Dentist',
				// raw row again: the stored instants in Postgres's text render
				start: '2026-10-07 13:00:00+00',
				end: '2026-10-07 14:00:00+00',
				description: null,
				location: null,
				allDay: false,
				recurrenceFrequency: null,
				recurrenceInterval: null,
				recurrenceByDay: null,
				recurrenceCount: null,
				recurrenceUntil: null,
				reminderMinutes: null,
				mirrorOf: null,
				created_at: expect.stringMatching(ISO)
			}
		});
	});

	it('moves the slot from a drag-move body (start + end only) and the next GET reflects it', async () => {
		const user = await seedOwnedEvent();

		const res = await invoke(putEvent, {
			ctx: ctx(),
			user,
			method: 'PUT',
			params: { id: EVENT },
			body: { start: '2026-10-08T13:00:00.000Z', end: '2026-10-08T14:00:00.000Z' }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			success: true,
			event: {
				id: EVENT,
				calendarId: PERSONAL_CAL,
				ownerId: user.id,
				title: 'Dentist',
				start: '2026-10-08 13:00:00+00',
				end: '2026-10-08 14:00:00+00',
				description: 'Bring forms',
				location: 'Clinic',
				allDay: false,
				recurrenceFrequency: null,
				recurrenceInterval: null,
				recurrenceByDay: null,
				recurrenceCount: null,
				recurrenceUntil: null,
				reminderMinutes: 30,
				mirrorOf: null,
				created_at: expect.stringMatching(ISO)
			}
		});

		const read = await invoke(getEvents, {
			ctx: ctx(),
			user,
			query: { from: '2026-10-08', to: '2026-10-08' }
		});
		expect(arrayField(objectBody(read), 'events')).toEqual([
			expect.objectContaining({
				id: 'evtoneoff01~2026-10-08T13:00:00.000Z',
				start: '2026-10-08T13:00:00.000Z',
				title: 'Dentist'
			})
		]);
	});

	it('clears recurrence when a partial body omits it (every write goes through normalizeEventRecurrence)', async () => {
		const user = await seedOwnedEvent({
			title: 'Piano',
			recurrenceFrequency: 'weekly',
			recurrenceInterval: 2,
			recurrenceCount: 5
		});

		const res = await invoke(putEvent, {
			ctx: ctx(),
			user,
			method: 'PUT',
			params: { id: EVENT },
			body: { title: 'Piano lesson' }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			success: true,
			event: {
				id: EVENT,
				calendarId: PERSONAL_CAL,
				ownerId: user.id,
				title: 'Piano lesson',
				start: '2026-10-07 13:00:00+00',
				end: '2026-10-07 14:00:00+00',
				description: 'Bring forms',
				location: 'Clinic',
				allDay: false,
				recurrenceFrequency: null,
				recurrenceInterval: null,
				recurrenceByDay: null,
				recurrenceCount: null,
				recurrenceUntil: null,
				reminderMinutes: 30,
				mirrorOf: null,
				created_at: expect.stringMatching(ISO)
			}
		});
	});

	it("scope 'this' writes an Exception Override and answers the series note", async () => {
		const user = await seedOwnedEvent({
			title: 'Piano',
			start: '2026-10-06T15:00:00.000Z',
			end: '2026-10-06T16:00:00.000Z',
			description: null,
			location: null,
			reminderMinutes: null,
			recurrenceFrequency: 'weekly',
			recurrenceInterval: 1,
			recurrenceCount: 3
		});

		const res = await invoke(putEvent, {
			ctx: ctx(),
			user,
			method: 'PUT',
			params: { id: `evtoneoff01~2026-10-13T15:00:00.000Z` },
			body: { scope: 'this', title: 'Piano (moved)', start: '2026-10-13T17:00:00.000Z' }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			success: true,
			note: 'Attendee changes apply to the whole series.'
		});

		const exceptions = await testDb().select().from(eventExceptions);
		expect(exceptions).toHaveLength(1);
		expect(exceptions[0]).toEqual(
			expect.objectContaining({
				eventId: EVENT,
				isCancelled: false,
				title: 'Piano (moved)',
				description: null,
				location: null,
				allDay: null,
				end: null
			})
		);
		expect(storedIso(exceptions[0]?.originalDate)).toBe('2026-10-13T15:00:00.000Z');
		expect(storedIso(exceptions[0]?.start)).toBe('2026-10-13T17:00:00.000Z');

		// The overridden occurrence keeps its slot key but shows the edited start,
		// and its end derives from the master's duration.
		const read = await invoke(getEvents, {
			ctx: ctx(),
			user,
			query: { from: '2026-10-01', to: '2026-10-31' }
		});
		expect(arrayField(objectBody(read), 'events')).toHaveLength(3);
		expect(arrayField(objectBody(read), 'events')[1]).toEqual(
			expect.objectContaining({
				id: 'evtoneoff01~2026-10-13T15:00:00.000Z',
				occurrenceDate: '2026-10-13T15:00:00.000Z',
				start: '2026-10-13T17:00:00.000Z',
				end: '2026-10-13T18:00:00.000Z',
				title: 'Piano (moved)'
			})
		);
	});

	it("scope 'this' with attendees replaces the invitations on the MASTER series", async () => {
		const user = await seedOwnedEvent({
			title: 'Piano',
			start: '2026-10-06T15:00:00.000Z',
			end: '2026-10-06T16:00:00.000Z',
			description: null,
			location: null,
			reminderMinutes: null,
			recurrenceFrequency: 'weekly',
			recurrenceInterval: 1,
			recurrenceCount: 3
		});

		const res = await invoke(putEvent, {
			ctx: ctx(),
			user,
			method: 'PUT',
			params: { id: `evtoneoff01~2026-10-13T15:00:00.000Z` },
			body: { scope: 'this', attendees: ['Grandma'] }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			success: true,
			note: 'Attendee changes apply to the whole series.'
		});
		// The event was seeded directly, so there is no creator RSVP row; a
		// replace-all leaves exactly the posted guest.
		const attendance = await testDb().select().from(eventAttendance);
		expect(attendance).toEqual([
			expect.objectContaining({
				eventId: EVENT,
				userId: null,
				name: 'Grandma',
				status: 'undecided',
				inviteType: 'optional'
			})
		]);
	});

	it("scope 'this' on a recurring master with a bare id needs an occurrenceDate", async () => {
		const user = await seedOwnedEvent({
			recurrenceFrequency: 'weekly',
			recurrenceInterval: 1,
			recurrenceCount: 3
		});

		const res = await invoke(putEvent, {
			ctx: ctx(),
			user,
			method: 'PUT',
			params: { id: EVENT },
			body: { scope: 'this', title: 'Renamed' }
		});

		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'A valid occurrenceDate is required' });
	});

	it("moving a recurring master's start shifts every Exception Override slot by the same delta", async () => {
		const user = await seedOwnedEvent({
			title: 'Piano',
			start: '2026-10-06T15:00:00.000Z',
			end: '2026-10-06T16:00:00.000Z',
			description: null,
			location: null,
			reminderMinutes: null,
			recurrenceFrequency: 'weekly',
			recurrenceInterval: 1,
			recurrenceCount: 3
		});
		await seedExceptionRow({
			eventId: EVENT,
			originalDate: '2026-10-13T15:00:00.000Z',
			isCancelled: true
		});
		// An edited slot carries its own start/end, shifted by the same delta as
		// the slot key (events.ts:316-321) or it would render at the old time.
		await seedExceptionRow({
			eventId: EVENT,
			originalDate: '2026-10-20T15:00:00.000Z',
			start: '2026-10-20T17:00:00.000Z',
			end: '2026-10-20T18:30:00.000Z',
			title: 'Piano (moved)'
		});

		const res = await invoke(putEvent, {
			ctx: ctx(),
			user,
			method: 'PUT',
			params: { id: EVENT },
			body: { start: '2026-10-08T15:00:00.000Z' }
		});

		expect(res.status).toBe(200);
		const exceptions = await testDb()
			.select()
			.from(eventExceptions)
			.orderBy(eventExceptions.originalDate);
		expect(exceptions).toHaveLength(2);
		expect(storedIso(exceptions[0]?.originalDate)).toBe('2026-10-15T15:00:00.000Z');
		expect(storedIso(exceptions[1]?.originalDate)).toBe('2026-10-22T15:00:00.000Z');
		expect(storedIso(exceptions[1]?.start)).toBe('2026-10-22T17:00:00.000Z');
		expect(storedIso(exceptions[1]?.end)).toBe('2026-10-22T18:30:00.000Z');
		expect(exceptions[1]?.title).toBe('Piano (moved)');
	});

	// events.ts:345-364: a whole-series edit propagates the fixed field set to
	// the mirror row; `calendarId` is deliberately not in it.
	it('propagates a master edit to its family mirror and leaves the mirror calendar alone', async () => {
		const user = await seedUser(testDb(), { firstName: 'Mia' });
		await testDb().insert(families).values({ id: FAMILY, name: 'Riveras' });
		await seedMembership(FAMILY, user.id);
		await seedCalendarRow(PERSONAL_CAL, { ownerId: user.id });
		await seedCalendarRow(FAMILY_CAL, { familyId: FAMILY });
		await seedEventRow({
			id: EVENT,
			ownerId: user.id,
			calendarId: PERSONAL_CAL,
			title: 'Piano',
			start: '2026-10-06T15:00:00.000Z',
			end: '2026-10-06T16:00:00.000Z',
			recurrenceFrequency: 'weekly',
			recurrenceInterval: 1,
			recurrenceCount: 3
		});
		await seedEventRow({
			id: 'evtmirror001',
			ownerId: user.id,
			calendarId: FAMILY_CAL,
			title: 'Piano',
			start: '2026-10-06T15:00:00.000Z',
			end: '2026-10-06T16:00:00.000Z',
			recurrenceFrequency: 'weekly',
			recurrenceInterval: 1,
			recurrenceCount: 3,
			mirrorOf: EVENT
		});

		const res = await invoke(putEvent, {
			ctx: ctx(),
			user,
			method: 'PUT',
			params: { id: EVENT },
			body: {
				title: 'Piano lesson',
				start: '2026-10-06T17:00:00.000Z',
				end: '2026-10-06T18:30:00.000Z',
				location: 'Studio',
				recurrenceFrequency: 'weekly',
				recurrenceInterval: 1,
				recurrenceCount: 4
			}
		});

		expect(res.status).toBe(200);
		const [mirror] = await testDb()
			.select()
			.from(events)
			.where(eq(events.id, 'evtmirror001'));
		expect(mirror).toEqual(
			expect.objectContaining({
				calendarId: FAMILY_CAL,
				ownerId: user.id,
				mirrorOf: EVENT,
				title: 'Piano lesson',
				location: 'Studio',
				allDay: false,
				recurrenceFrequency: 'weekly',
				recurrenceInterval: 1,
				recurrenceCount: 4
			})
		);
		expect(storedIso(mirror?.start)).toBe('2026-10-06T17:00:00.000Z');
		expect(storedIso(mirror?.end)).toBe('2026-10-06T18:30:00.000Z');
		// The master stayed on its own calendar: the mirror is what moves calendars.
		const [master] = await testDb().select().from(events).where(eq(events.id, EVENT));
		expect(master?.calendarId).toBe(PERSONAL_CAL);
	});

	// events.ts:72-86: an edit merges only the fields it defines, so a second
	// scope-'this' write keeps what the first one set.
	it('merges a second scope-this edit over the fields the first one wrote', async () => {
		const user = await seedOwnedEvent({
			title: 'Piano',
			start: '2026-10-06T15:00:00.000Z',
			end: '2026-10-06T16:00:00.000Z',
			description: null,
			location: null,
			reminderMinutes: null,
			recurrenceFrequency: 'weekly',
			recurrenceInterval: 1,
			recurrenceCount: 3
		});

		const first = await invoke(putEvent, {
			ctx: ctx(),
			user,
			method: 'PUT',
			params: { id: `${EVENT}~2026-10-13T15:00:00.000Z` },
			body: { scope: 'this', title: 'Piano (moved)', location: 'Studio' }
		});
		expect(first.status).toBe(200);

		const second = await invoke(putEvent, {
			ctx: ctx(),
			user,
			method: 'PUT',
			params: { id: `${EVENT}~2026-10-13T15:00:00.000Z` },
			body: { scope: 'this', start: '2026-10-13T17:00:00.000Z' }
		});
		expect(second.status).toBe(200);
		expect(second.body).toEqual({
			success: true,
			note: 'Attendee changes apply to the whole series.'
		});

		const exceptions = await testDb().select().from(eventExceptions);
		expect(exceptions).toHaveLength(1);
		expect(exceptions[0]).toEqual(
			expect.objectContaining({
				eventId: EVENT,
				isCancelled: false,
				title: 'Piano (moved)',
				location: 'Studio'
			})
		);
		expect(storedIso(exceptions[0]?.originalDate)).toBe('2026-10-13T15:00:00.000Z');
		expect(storedIso(exceptions[0]?.start)).toBe('2026-10-13T17:00:00.000Z');
		expect(exceptions[0]?.end).toBeNull();

		// The slot still renders with the master's one-hour duration.
		const read = await invoke(getEvents, {
			ctx: ctx(),
			user,
			query: { from: '2026-10-01', to: '2026-10-31' }
		});
		expect(arrayField(objectBody(read), 'events')[1]).toEqual(
			expect.objectContaining({
				id: `${EVENT}~2026-10-13T15:00:00.000Z`,
				occurrenceDate: '2026-10-13T15:00:00.000Z',
				start: '2026-10-13T17:00:00.000Z',
				end: '2026-10-13T18:00:00.000Z',
				title: 'Piano (moved)',
				location: 'Studio'
			})
		);
	});

	// events.ts:72-86 defaults `isCancelled` to false, so a scope-'this' PUT on
	// a cancelled slot brings the occurrence back.
	it('un-cancels a cancelled slot when a scope-this PUT edits it', async () => {
		const user = await seedOwnedEvent({
			title: 'Piano',
			start: '2026-10-06T15:00:00.000Z',
			end: '2026-10-06T16:00:00.000Z',
			description: null,
			location: null,
			reminderMinutes: null,
			recurrenceFrequency: 'weekly',
			recurrenceInterval: 1,
			recurrenceCount: 3
		});
		await seedExceptionRow({
			eventId: EVENT,
			originalDate: '2026-10-13T15:00:00.000Z',
			isCancelled: true
		});

		const res = await invoke(putEvent, {
			ctx: ctx(),
			user,
			method: 'PUT',
			params: { id: `${EVENT}~2026-10-13T15:00:00.000Z` },
			body: { scope: 'this', title: 'Piano (back)' }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			success: true,
			note: 'Attendee changes apply to the whole series.'
		});
		const exceptions = await testDb().select().from(eventExceptions);
		expect(exceptions).toHaveLength(1);
		expect(exceptions[0]).toEqual(
			expect.objectContaining({ eventId: EVENT, isCancelled: false, title: 'Piano (back)' })
		);

		const read = await invoke(getEvents, {
			ctx: ctx(),
			user,
			query: { from: '2026-10-01', to: '2026-10-31' }
		});
		const events = arrayField(objectBody(read), 'events');
		expect(events).toHaveLength(3);
		expect(events[1]).toEqual(
			expect.objectContaining({
				id: `${EVENT}~2026-10-13T15:00:00.000Z`,
				start: '2026-10-13T15:00:00.000Z',
				end: '2026-10-13T16:00:00.000Z',
				title: 'Piano (back)'
			})
		);
	});

	// Access gap pinned as today: a scope-'this' write checks `canTouchEvent`
	// — READ access — not the #165 owner leg (calendarScope.ts:65-79,
	// [id]/+server.ts:55,156), so a family member may rewrite or cancel another
	// member's occurrence. A whole-series PUT is still refused.
	it("lets a family member rewrite and cancel another member's occurrence (scope 'this' needs read access only)", async () => {
		const owner = await seedUser(testDb(), { firstName: 'Mia' });
		const partner = await seedUser(testDb(), { firstName: 'Sam' });
		await testDb().insert(families).values({ id: FAMILY, name: 'Riveras' });
		await seedMembership(FAMILY, owner.id);
		await seedMembership(FAMILY, partner.id);
		await seedCalendarRow(FAMILY_CAL, { familyId: FAMILY });
		await seedRecurringEventRow({
			id: EVENT,
			ownerId: owner.id,
			calendarId: FAMILY_CAL,
			title: 'Piano',
			start: '2026-10-06T15:00:00.000Z',
			end: '2026-10-06T16:00:00.000Z',
			count: 3
		});

		const rewrite = await invoke(putEvent, {
			ctx: ctx(),
			user: partner,
			method: 'PUT',
			params: { id: `${EVENT}~2026-10-13T15:00:00.000Z` },
			body: { scope: 'this', title: 'Piano (partner)' }
		});
		expect(rewrite.status).toBe(200);
		expect(rewrite.body).toEqual({
			success: true,
			note: 'Attendee changes apply to the whole series.'
		});

		const cancel = await invoke(deleteEvent, {
			ctx: ctx(),
			user: partner,
			method: 'DELETE',
			params: { id: `${EVENT}~2026-10-20T15:00:00.000Z` },
			body: { scope: 'this' }
		});
		expect(cancel.status).toBe(200);
		expect(cancel.body).toEqual({ success: true });

		// The owner leg still holds for the series itself.
		const series = await invoke(putEvent, {
			ctx: ctx(),
			user: partner,
			method: 'PUT',
			params: { id: EVENT },
			body: { title: 'Hijacked' }
		});
		expect(series.status).toBe(404);
		expect(series.body).toEqual({ error: 'Event not found' });

		const exceptions = await testDb()
			.select()
			.from(eventExceptions)
			.orderBy(eventExceptions.originalDate);
		expect(exceptions).toHaveLength(2);
		expect(exceptions[0]).toEqual(
			expect.objectContaining({
				eventId: EVENT,
				isCancelled: false,
				title: 'Piano (partner)'
			})
		);
		expect(exceptions[1]).toEqual(
			expect.objectContaining({ eventId: EVENT, isCancelled: true })
		);
	});

	// A scope-'this' PUT only special-cases a RECURRING master, so on a one-off
	// it falls through to the ordinary partial update (no note in the answer).
	it("treats scope 'this' on a one-off as a full update", async () => {
		const user = await seedOwnedEvent();

		const res = await invoke(putEvent, {
			ctx: ctx(),
			user,
			method: 'PUT',
			params: { id: EVENT },
			body: { scope: 'this', title: 'Dentist (moved)' }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			success: true,
			event: {
				id: EVENT,
				calendarId: PERSONAL_CAL,
				ownerId: user.id,
				title: 'Dentist (moved)',
				start: '2026-10-07 13:00:00+00',
				end: '2026-10-07 14:00:00+00',
				description: 'Bring forms',
				location: 'Clinic',
				allDay: false,
				recurrenceFrequency: null,
				recurrenceInterval: null,
				recurrenceByDay: null,
				recurrenceCount: null,
				recurrenceUntil: null,
				reminderMinutes: 30,
				mirrorOf: null,
				created_at: expect.stringMatching(ISO)
			}
		});
		expect(await testDb().select().from(eventExceptions)).toEqual([]);
	});

	it("answers 404 'Event not found' for an unknown id", async () => {
		const user = await seedUser(testDb());
		const res = await invoke(putEvent, {
			ctx: ctx(),
			user,
			method: 'PUT',
			params: { id: 'missingevent1' },
			body: { title: 'Renamed' }
		});

		expect(res.status).toBe(404);
		expect(res.body).toEqual({ error: 'Event not found' });
	});

	it('answers 404 for a reader who is not the owner (issue 165 owner leg)', async () => {
		const owner = await seedUser(testDb());
		const partner = await seedUser(testDb());
		await testDb().insert(families).values({ id: FAMILY, name: 'Riveras' });
		await seedMembership(FAMILY, owner.id);
		await seedMembership(FAMILY, partner.id);
		await seedCalendarRow(FAMILY_CAL, { familyId: FAMILY });
		await seedEventRow({
			id: EVENT,
			ownerId: owner.id,
			calendarId: FAMILY_CAL,
			title: 'Dentist',
			start: START,
			end: END
		});

		const res = await invoke(putEvent, {
			ctx: ctx(),
			user: partner,
			method: 'PUT',
			params: { id: EVENT },
			body: { title: 'Hijacked' }
		});

		expect(res.status).toBe(404);
		expect(res.body).toEqual({ error: 'Event not found' });
		const [row] = await testDb().select().from(events).where(eq(events.id, EVENT));
		expect(row?.title).toBe('Dentist');
	});

	it("answers 403 'Calendar not accessible' for a move onto a calendar the viewer cannot see", async () => {
		const user = await seedOwnedEvent();
		const stranger = await seedUser(testDb());
		await seedCalendarRow('cal-stranger1', { ownerId: stranger.id });

		const res = await invoke(putEvent, {
			ctx: ctx(),
			user,
			method: 'PUT',
			params: { id: EVENT },
			body: { calendarId: 'cal-stranger1' }
		});

		expect(res.status).toBe(403);
		expect(res.body).toEqual({ error: 'Calendar not accessible' });
	});

	const INVALID_EVENT_IDS: readonly string[] = [
		'no',
		'abc~2026-10-07T13:00:00.000Z',
		'evtoneoff01~nope'
	];

	it.each(INVALID_EVENT_IDS)(
		"answers 400 'Invalid event id' for %s",
		async (id) => {
			const user = await seedUser(testDb());
			const res = await invoke(putEvent, {
				ctx: ctx(),
				user,
				method: 'PUT',
				params: { id },
				body: { title: 'Renamed' }
			});
			expect(res.status).toBe(400);
			expect(res.body).toEqual({ error: 'Invalid event id' });
		}
	);

	it('answers 500 {"error":"Failed to update event"} when the row cannot be written', async () => {
		const user = await seedOwnedEvent();

		const res = await invoke(putEvent, {
			ctx: ctx(),
			user,
			method: 'PUT',
			params: { id: EVENT },
			headers: { 'x-real-ip': '10.2.1.1' },
			body: { title: null }
		});

		expect(res.status).toBe(500);
		expect(res.body).toEqual({ error: 'Failed to update event' });
	});
});

describe('DELETE /api/events/[id]', () => {
	const EVENT = 'evtrecurring1';

	async function seedSeries(input: { mirror?: boolean; cancelledSlot?: boolean } = {}) {
		const user = await seedUser(testDb(), { firstName: 'Mia' });
		await testDb().insert(families).values({ id: FAMILY, name: 'Riveras' });
		await seedCalendarRow(PERSONAL_CAL, { ownerId: user.id });
		await seedCalendarRow(FAMILY_CAL, { familyId: FAMILY });
		await seedEventRow({
			id: EVENT,
			ownerId: user.id,
			calendarId: PERSONAL_CAL,
			title: 'Piano',
			start: '2026-10-06T15:00:00.000Z',
			end: '2026-10-06T16:00:00.000Z',
			recurrenceFrequency: 'weekly',
			recurrenceInterval: 1,
			recurrenceCount: 3
		});
		if (input.mirror) {
			await seedEventRow({
				id: 'evtmirror001',
				ownerId: user.id,
				calendarId: FAMILY_CAL,
				title: 'Piano',
				start: '2026-10-06T15:00:00.000Z',
				end: '2026-10-06T16:00:00.000Z',
				recurrenceFrequency: 'weekly',
				recurrenceInterval: 1,
				recurrenceCount: 3,
				mirrorOf: EVENT
			});
		}
		if (input.cancelledSlot) {
			await seedExceptionRow({
				eventId: EVENT,
				originalDate: '2026-10-13T15:00:00.000Z',
				isCancelled: true
			});
		}
		return user;
	}

	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const res = await invoke(deleteEvent, { ctx: ctx(), method: 'DELETE', params: { id: EVENT } });

		expect(res.status).toBe(401);
		expect(res.body).toEqual({ error: 'Unauthorized' });
	});

	it('a bare DELETE removes the master, its family mirror and its exceptions in one transaction', async () => {
		const user = await seedSeries({ mirror: true, cancelledSlot: true });

		const res = await invoke(deleteEvent, {
			ctx: ctx(),
			user,
			method: 'DELETE',
			params: { id: EVENT }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true });
		expect(await testDb().select().from(events)).toEqual([]);
		expect(await testDb().select().from(eventExceptions)).toEqual([]);
	});

	it("a scope 'this' DELETE on a one-off removes that event", async () => {
		const user = await seedUser(testDb());
		await seedCalendarRow(PERSONAL_CAL, { ownerId: user.id });
		await seedEventRow({
			id: 'evtoneoff01',
			ownerId: user.id,
			calendarId: PERSONAL_CAL,
			title: 'Dentist',
			start: '2026-10-07T13:00:00.000Z'
		});

		const res = await invoke(deleteEvent, {
			ctx: ctx(),
			user,
			method: 'DELETE',
			params: { id: 'evtoneoff01' },
			body: { scope: 'this' }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true });
		expect(await testDb().select().from(events)).toEqual([]);
	});

	it("a scope 'this' DELETE on a recurring occurrence cancels it and keeps the series", async () => {
		const user = await seedSeries();

		const res = await invoke(deleteEvent, {
			ctx: ctx(),
			user,
			method: 'DELETE',
			params: { id: `${EVENT}~2026-10-13T15:00:00.000Z` },
			body: { scope: 'this' }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true });
		expect(await testDb().select({ id: events.id }).from(events)).toHaveLength(1);
		const exceptions = await testDb().select().from(eventExceptions);
		expect(exceptions).toHaveLength(1);
		expect(exceptions[0]).toEqual(expect.objectContaining({ eventId: EVENT, isCancelled: true }));
		expect(storedIso(exceptions[0]?.originalDate)).toBe('2026-10-13T15:00:00.000Z');

		const read = await invoke(getEvents, {
			ctx: ctx(),
			user,
			query: { from: '2026-10-01', to: '2026-10-31' }
		});
		expect(
			arrayField(objectBody(read), 'events').map((event) => String(objectValue(event, 'event')['id']))
		).toEqual([
			'evtrecurring1~2026-10-06T15:00:00.000Z',
			'evtrecurring1~2026-10-20T15:00:00.000Z'
		]);
	});

	it("scope 'this' on a recurring master with a bare id needs an occurrenceDate", async () => {
		const user = await seedSeries();

		const res = await invoke(deleteEvent, {
			ctx: ctx(),
			user,
			method: 'DELETE',
			params: { id: EVENT },
			body: { scope: 'this' }
		});

		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'A valid occurrenceDate is required' });
	});

	it('a body that is not JSON still means the whole series', async () => {
		const user = await seedSeries();

		const res = await invoke(deleteEvent, {
			ctx: ctx(),
			user,
			method: 'DELETE',
			params: { id: EVENT },
			rawBody: 'not json at all'
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true });
		expect(await testDb().select().from(events)).toEqual([]);
	});

	it("answers 404 'Event not found' for an unknown id", async () => {
		const user = await seedUser(testDb());
		const res = await invoke(deleteEvent, {
			ctx: ctx(),
			user,
			method: 'DELETE',
			params: { id: 'missingevent1' }
		});

		expect(res.status).toBe(404);
		expect(res.body).toEqual({ error: 'Event not found' });
	});

	it("answers 403 'Event not accessible' when a stranger cancels someone else's occurrence", async () => {
		await seedSeries();
		const stranger = await seedUser(testDb());

		const res = await invoke(deleteEvent, {
			ctx: ctx(),
			user: stranger,
			method: 'DELETE',
			params: { id: `${EVENT}~2026-10-13T15:00:00.000Z` },
			body: { scope: 'this' }
		});

		expect(res.status).toBe(403);
		expect(res.body).toEqual({ error: 'Event not accessible' });
	});

	it("answers 404 for a stranger's whole-series delete", async () => {
		await seedSeries();
		const stranger = await seedUser(testDb());

		const res = await invoke(deleteEvent, {
			ctx: ctx(),
			user: stranger,
			method: 'DELETE',
			params: { id: EVENT }
		});

		expect(res.status).toBe(404);
		expect(res.body).toEqual({ error: 'Event not found' });
		expect(await testDb().select({ id: events.id }).from(events)).toHaveLength(1);
	});

	it("answers 400 'Invalid event id' for an id that is not a master id", async () => {
		const user = await seedUser(testDb());
		const res = await invoke(deleteEvent, {
			ctx: ctx(),
			user,
			method: 'DELETE',
			params: { id: 'no' }
		});

		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'Invalid event id' });
	});
});

describe('GET /api/events/[id]/rsvp', () => {
	const EVENT = 'evtoneoff01';

	async function seedEventWithGuests() {
		const user = await seedUser(testDb(), { firstName: 'Mia', lastName: 'Rivera' });
		await seedCalendarRow(PERSONAL_CAL, { ownerId: user.id });
		await seedEventRow({
			id: EVENT,
			ownerId: user.id,
			calendarId: PERSONAL_CAL,
			title: 'Dentist',
			start: '2026-10-07T13:00:00.000Z'
		});
		await seedAttendanceRow([
			{ eventId: EVENT, userId: user.id, status: 'going', inviteType: 'optional' },
			{ eventId: EVENT, name: 'Grandma', status: 'undecided', inviteType: 'optional' }
		]);
		return user;
	}

	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const res = await invoke(getRsvp, { ctx: ctx(), params: { id: EVENT } });

		expect(res.status).toBe(401);
		expect(res.body).toEqual({ error: 'Unauthorized' });
	});

	it('lists the attendance, the viewer RSVP and the guest names', async () => {
		const user = await seedEventWithGuests();

		const res = await invoke(getRsvp, { ctx: ctx(), user, params: { id: EVENT } });

		expect(res.status).toBe(200);
		const body = objectBody(res);
		expect(body.userRsvpStatus).toBe('going');
		expect(body.nonUserAttendants).toEqual(['Grandma']);
		expect(arrayField(body, 'attendance')).toHaveLength(2);
		expect(arrayField(body, 'attendance')).toEqual(
			expect.arrayContaining([
				{
					id: expect.any(String),
					eventId: EVENT,
					userId: user.id,
					name: null,
					status: 'going',
					inviteType: 'optional',
					firstName: 'Mia',
					lastName: 'Rivera'
				},
				{
					id: expect.any(String),
					eventId: EVENT,
					userId: null,
					name: 'Grandma',
					status: 'undecided',
					inviteType: 'optional',
					firstName: null,
					lastName: null
				}
			])
		);
	});

	it('defaults the viewer RSVP to undecided when there is no row', async () => {
		const owner = await seedUser(testDb(), { firstName: 'Mia' });
		const partner = await seedUser(testDb(), { firstName: 'Sam' });
		await testDb().insert(families).values({ id: FAMILY, name: 'Riveras' });
		await seedMembership(FAMILY, owner.id);
		await seedMembership(FAMILY, partner.id);
		await seedCalendarRow(FAMILY_CAL, { familyId: FAMILY });
		await seedEventRow({
			id: EVENT,
			ownerId: owner.id,
			calendarId: FAMILY_CAL,
			title: 'Dentist',
			start: '2026-10-07T13:00:00.000Z'
		});

		const res = await invoke(getRsvp, { ctx: ctx(), user: partner, params: { id: EVENT } });

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ attendance: [], userRsvpStatus: 'undecided', nonUserAttendants: [] });
	});

	it("answers 404 'Event not found' for an unknown id and 403 'No access to this event' for a stranger", async () => {
		await seedEventWithGuests();
		const stranger = await seedUser(testDb());

		const missing = await invoke(getRsvp, {
			ctx: ctx(),
			user: stranger,
			params: { id: 'missingevent1' }
		});
		expect(missing.status).toBe(404);
		expect(missing.body).toEqual({ error: 'Event not found' });

		const denied = await invoke(getRsvp, { ctx: ctx(), user: stranger, params: { id: EVENT } });
		expect(denied.status).toBe(403);
		expect(denied.body).toEqual({ error: 'No access to this event' });
	});

	// Pinned as today: the rsvp pair looks `params.id` up in `events` with no
	// occurrence resolution, so the composite id every display row carries is
	// "not found" (rsvp/+server.ts:18,79) — unlike PUT/DELETE/ics.
	it('answers 404 for a composite occurrence id (rsvp only knows master ids)', async () => {
		const owner = await seedUser(testDb(), { firstName: 'Mia' });
		await seedCalendarRow(PERSONAL_CAL, { ownerId: owner.id });
		await seedRecurringEventRow({
			id: 'evtrecurring1',
			ownerId: owner.id,
			calendarId: PERSONAL_CAL,
			title: 'Piano',
			start: '2026-10-06T15:00:00.000Z',
			end: '2026-10-06T16:00:00.000Z',
			count: 3
		});

		const occurrenceId = 'evtrecurring1~2026-10-13T15:00:00.000Z';
		const read = await invoke(getRsvp, {
			ctx: ctx(),
			user: owner,
			params: { id: occurrenceId }
		});
		expect(read.status).toBe(404);
		expect(read.body).toEqual({ error: 'Event not found' });

		const write = await invoke(postRsvp, {
			ctx: ctx(),
			user: owner,
			method: 'POST',
			params: { id: occurrenceId },
			body: { status: 'going' }
		});
		expect(write.status).toBe(404);
		expect(write.body).toEqual({ error: 'Event not found' });
	});
});

describe('POST /api/events/[id]/rsvp', () => {
	const EVENT = 'evtoneoff01';

	async function seedRsvpEvent() {
		const user = await seedUser(testDb(), { firstName: 'Mia', lastName: 'Rivera' });
		await seedCalendarRow(PERSONAL_CAL, { ownerId: user.id });
		await seedEventRow({
			id: EVENT,
			ownerId: user.id,
			calendarId: PERSONAL_CAL,
			title: 'Dentist',
			start: '2026-10-07T13:00:00.000Z'
		});
		return user;
	}

	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const res = await invoke(postRsvp, {
			ctx: ctx(),
			method: 'POST',
			params: { id: EVENT },
			body: { status: 'going' }
		});

		expect(res.status).toBe(401);
		expect(res.body).toEqual({ error: 'Unauthorized' });
	});

	it('upserts the viewer RSVP and answers the attendance (rsvpStatus carries the same rows)', async () => {
		const user = await seedRsvpEvent();

		const res = await invoke(postRsvp, {
			ctx: ctx(),
			user,
			method: 'POST',
			params: { id: EVENT },
			body: { status: 'maybe' }
		});

		expect(res.status).toBe(200);
		// Legacy quirk kept on purpose: `rsvpStatus` is the raw attendance ROWS,
		// not a single status (getEventRsvpStatus selects every row), while
		// `attendance` is the same rows joined to the member's names.
		expect(res.body).toEqual({
			success: true,
			rsvpStatus: [
				{
					id: expect.any(String),
					eventId: EVENT,
					userId: user.id,
					name: null,
					status: 'maybe',
					inviteType: 'optional'
				}
			],
			attendance: [
				{
					id: expect.any(String),
					eventId: EVENT,
					userId: user.id,
					name: null,
					status: 'maybe',
					inviteType: 'optional',
					firstName: 'Mia',
					lastName: 'Rivera'
				}
			]
		});

		const rows = await testDb().select().from(eventAttendance);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.status).toBe('maybe');
	});

	it('clearing the answer stores undecided', async () => {
		const user = await seedRsvpEvent();

		await invoke(postRsvp, {
			ctx: ctx(),
			user,
			method: 'POST',
			params: { id: EVENT },
			body: { status: 'going' }
		});
		const res = await invoke(postRsvp, {
			ctx: ctx(),
			user,
			method: 'POST',
			params: { id: EVENT },
			body: { status: 'undecided' }
		});

		expect(res.status).toBe(200);
		expect(arrayField(objectBody(res), 'attendance')[0]).toEqual(
			expect.objectContaining({ userId: user.id, status: 'undecided' })
		);
	});

	it("answers 400 'Invalid RSVP status' for anything outside the vocabulary", async () => {
		const user = await seedRsvpEvent();

		const res = await invoke(postRsvp, {
			ctx: ctx(),
			user,
			method: 'POST',
			params: { id: EVENT },
			body: { status: 'excited' }
		});

		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'Invalid RSVP status' });
	});

	it('invites a named guest once, answering the attendance without an rsvpStatus', async () => {
		const user = await seedRsvpEvent();

		const first = await invoke(postRsvp, {
			ctx: ctx(),
			user,
			method: 'POST',
			params: { id: EVENT },
			body: { guest: '  Grandma  ' }
		});
		expect(first.status).toBe(200);
		expect(objectBody(first).success).toBe(true);
		expect(objectBody(first).rsvpStatus).toBeUndefined();
		expect(arrayField(objectBody(first), 'attendance')).toEqual([
			{
				id: expect.any(String),
				eventId: EVENT,
				userId: null,
				name: 'Grandma',
				status: 'undecided',
				inviteType: 'optional',
				firstName: null,
				lastName: null
			}
		]);

		const again = await invoke(postRsvp, {
			ctx: ctx(),
			user,
			method: 'POST',
			params: { id: EVENT },
			body: { guest: 'grandma' }
		});
		expect(again.status).toBe(200);
		expect(arrayField(objectBody(again), 'attendance')).toHaveLength(1);
	});

	const BLANK_GUESTS: readonly { guest: string | number }[] = [{ guest: '   ' }, { guest: 5 }];

	it.each(BLANK_GUESTS)(
		"answers 400 'Guest name is required' for guest $guest",
		async ({ guest }) => {
			const user = await seedRsvpEvent();
			const res = await invoke(postRsvp, {
				ctx: ctx(),
				user,
				method: 'POST',
				params: { id: EVENT },
				body: { guest }
			});
			expect(res.status).toBe(400);
			expect(res.body).toEqual({ error: 'Guest name is required' });
		}
	);

	it("answers 404 'Event not found' and 403 'No access to this event'", async () => {
		await seedRsvpEvent();
		const stranger = await seedUser(testDb());

		const missing = await invoke(postRsvp, {
			ctx: ctx(),
			user: stranger,
			method: 'POST',
			params: { id: 'missingevent1' },
			body: { status: 'going' }
		});
		expect(missing.status).toBe(404);
		expect(missing.body).toEqual({ error: 'Event not found' });

		const denied = await invoke(postRsvp, {
			ctx: ctx(),
			user: stranger,
			method: 'POST',
			params: { id: EVENT },
			body: { status: 'going' }
		});
		expect(denied.status).toBe(403);
		expect(denied.body).toEqual({ error: 'No access to this event' });
	});
});

describe('GET /api/events/[id]/ics', () => {
	const EVENT = 'evtoneoff01';

	async function seedCalendarAndEvent(overrides: Partial<EventSeed> = {}) {
		const user = await seedUser(testDb(), { firstName: 'Mia' });
		await seedCalendarRow(PERSONAL_CAL, { ownerId: user.id });
		await seedEventRow({
			id: EVENT,
			ownerId: user.id,
			calendarId: PERSONAL_CAL,
			title: 'Soccer practice',
			start: '2026-10-05T09:00:00.000Z',
			end: '2026-10-05T10:00:00.000Z',
			...overrides
		});
		return user;
	}

	it('answers 401 Unauthorized as plain text when signed out', async () => {
		const res = await invoke(getEventIcs, { ctx: ctx(), params: { id: EVENT } });

		expect(res.status).toBe(401);
		expect(res.text).toBe('Unauthorized');
	});

	it('downloads one VEVENT with the escaping, the UTC instants and the attachment name', async () => {
		const user = await seedCalendarAndEvent({
			title: 'Soccer, practice; outdoors',
			description: 'Bring\nsnacks',
			location: 'Park'
		});

		const res = await invoke(getEventIcs, { ctx: ctx(), user, params: { id: EVENT } });

		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('text/calendar; charset=utf-8');
		expect(res.headers.get('content-disposition')).toBe(
			'attachment; filename="soccer-practice-outdoors.ics"'
		);
		expect(res.text.split('\r\n')).toEqual([
			'BEGIN:VCALENDAR',
			'VERSION:2.0',
			'CALSCALE:GREGORIAN',
			'BEGIN:VEVENT',
			'UID:evtoneoff01@familyplanz.com',
			expect.stringMatching(/^DTSTAMP:\d{8}T\d{6}Z$/),
			'DTSTART:20261005T090000Z',
			'DTEND:20261005T100000Z',
			'SUMMARY:Soccer\\, practice\\; outdoors',
			'DESCRIPTION:Bring\\nsnacks',
			'LOCATION:Park',
			'END:VEVENT',
			'END:VCALENDAR',
			''
		]);
	});

	it('writes an all-day event as VALUE=DATE with an exclusive DTEND', async () => {
		const user = await seedCalendarAndEvent({
			title: 'Camping',
			start: '2026-10-05T00:00:00.000Z',
			end: '2026-10-06T23:59:59.999Z',
			allDay: true
		});

		const res = await invoke(getEventIcs, { ctx: ctx(), user, params: { id: EVENT } });

		expect(res.status).toBe(200);
		const lines = res.text.split('\r\n');
		expect(lines.slice(6, 8)).toEqual(['DTSTART;VALUE=DATE:20261005', 'DTEND;VALUE=DATE:20261007']);
	});

	it('emits the RRULE with INTERVAL, BYDAY and UNTIL winning over COUNT', async () => {
		const user = await seedCalendarAndEvent({
			title: 'Piano',
			start: '2026-10-05T15:00:00.000Z',
			end: '2026-10-05T16:00:00.000Z',
			recurrenceFrequency: 'weekly',
			recurrenceInterval: 2,
			recurrenceByDay: ['MO', 'WE'],
			recurrenceCount: 5,
			recurrenceUntil: '2026-12-31T23:59:59.000Z'
		});

		const res = await invoke(getEventIcs, { ctx: ctx(), user, params: { id: EVENT } });

		expect(res.status).toBe(200);
		expect(res.text).toContain(
			'RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;UNTIL=20261231T235959Z'
		);
		expect(res.text).not.toContain('COUNT=');
	});

	it('exports a scope-this Exception Override as one VEVENT without an RRULE', async () => {
		const user = await seedCalendarAndEvent({
			title: 'Piano',
			start: '2026-10-06T15:00:00.000Z',
			end: '2026-10-06T16:00:00.000Z',
			description: null,
			location: null,
			recurrenceFrequency: 'weekly',
			recurrenceInterval: 1,
			recurrenceCount: 3
		});
		await seedExceptionRow({
			eventId: EVENT,
			originalDate: '2026-10-13T15:00:00.000Z',
			isCancelled: false,
			title: 'Piano (moved)',
			start: '2026-10-13T17:00:00.000Z',
			end: '2026-10-13T18:00:00.000Z'
		});

		const res = await invoke(getEventIcs, {
			ctx: ctx(),
			user,
			params: { id: `${EVENT}~2026-10-13T15:00:00.000Z` }
		});

		expect(res.status).toBe(200);
		const lines = res.text.split('\r\n');
		expect(lines).toContain('SUMMARY:Piano (moved)');
		expect(lines).toContain('DTSTART:20261013T170000Z');
		expect(lines).toContain('DTEND:20261013T180000Z');
		expect(res.text).not.toContain('RRULE:');
	});

	// Q-048 (flip-ready): an Exception Override exports `exception.end ?? event.end`,
	// so a START-ONLY override carries the MASTER's end — here an hour BEFORE its
	// own DTSTART. The owner's fix derives the end from the master duration.
	it('exports a start-only override with the MASTER end, even before its DTSTART (Q-048)', async () => {
		const user = await seedCalendarAndEvent({
			title: 'Piano',
			start: '2026-10-06T15:00:00.000Z',
			end: '2026-10-06T16:00:00.000Z',
			description: null,
			location: null,
			recurrenceFrequency: 'weekly',
			recurrenceInterval: 1,
			recurrenceCount: 3
		});
		await seedExceptionRow({
			eventId: EVENT,
			originalDate: '2026-10-13T15:00:00.000Z',
			isCancelled: false,
			start: '2026-10-13T17:00:00.000Z'
		});

		const res = await invoke(getEventIcs, {
			ctx: ctx(),
			user,
			params: { id: `${EVENT}~2026-10-13T15:00:00.000Z` }
		});

		expect(res.status).toBe(200);
		expect(res.text.split('\r\n')).toEqual([
			'BEGIN:VCALENDAR',
			'VERSION:2.0',
			'CALSCALE:GREGORIAN',
			'BEGIN:VEVENT',
			'UID:evtoneoff01@familyplanz.com',
			expect.stringMatching(/^DTSTAMP:\d{8}T\d{6}Z$/),
			'DTSTART:20261013T170000Z',
			// The master's end, one week earlier than this occurrence's start.
			'DTEND:20261006T160000Z',
			'SUMMARY:Piano',
			'END:VEVENT',
			'END:VCALENDAR',
			''
		]);
	});

	// Q-048 (flip-ready), the other half: a TITLE-ONLY override exports the
	// MASTER's DTSTART, not the occurrence slot it belongs to.
	it("exports a title-only override with the master's DTSTART (Q-048)", async () => {
		const user = await seedCalendarAndEvent({
			title: 'Piano',
			start: '2026-10-06T15:00:00.000Z',
			end: '2026-10-06T16:00:00.000Z',
			description: null,
			location: null,
			recurrenceFrequency: 'weekly',
			recurrenceInterval: 1,
			recurrenceCount: 3
		});
		await seedExceptionRow({
			eventId: EVENT,
			originalDate: '2026-10-13T15:00:00.000Z',
			isCancelled: false,
			title: 'Piano (renamed)'
		});

		const res = await invoke(getEventIcs, {
			ctx: ctx(),
			user,
			params: { id: `${EVENT}~2026-10-13T15:00:00.000Z` }
		});

		expect(res.status).toBe(200);
		expect(res.text.split('\r\n')).toEqual([
			'BEGIN:VCALENDAR',
			'VERSION:2.0',
			'CALSCALE:GREGORIAN',
			'BEGIN:VEVENT',
			'UID:evtoneoff01@familyplanz.com',
			expect.stringMatching(/^DTSTAMP:\d{8}T\d{6}Z$/),
			'DTSTART:20261006T150000Z',
			'DTEND:20261006T160000Z',
			'SUMMARY:Piano (renamed)',
			'END:VEVENT',
			'END:VCALENDAR',
			''
		]);
	});

	// A COUNT-only rule has no INTERVAL (calendar interval is 1) and no UNTIL.
	it('writes a COUNT-only RRULE and omits INTERVAL=1', async () => {
		const user = await seedCalendarAndEvent({
			title: 'Piano',
			start: '2026-10-05T15:00:00.000Z',
			end: '2026-10-05T16:00:00.000Z',
			recurrenceFrequency: 'weekly',
			recurrenceInterval: 1,
			recurrenceCount: 5
		});

		const res = await invoke(getEventIcs, { ctx: ctx(), user, params: { id: EVENT } });

		expect(res.status).toBe(200);
		expect(res.text).toContain('RRULE:FREQ=WEEKLY;COUNT=5');
		expect(res.text).not.toContain('INTERVAL=');
	});

	// A missing end becomes +1 hour for a timed Event, and the SUMMARY is never
	// folded — one long line even past RFC 5545's 75 octets.
	it('defaults a missing end to +1 hour and never folds a long SUMMARY line', async () => {
		const longTitle =
			'Soccer practice with the whole extended family and the neighbours from next door';
		const user = await seedCalendarAndEvent({
			title: longTitle,
			start: '2026-10-05T09:00:00.000Z',
			end: null
		});

		const res = await invoke(getEventIcs, { ctx: ctx(), user, params: { id: EVENT } });

		expect(res.status).toBe(200);
		const lines = res.text.split('\r\n');
		expect(lines).toContain('DTEND:20261005T100000Z');
		expect(lines).toContain(`SUMMARY:${longTitle}`);
		expect(lines.filter((line) => line.startsWith(' '))).toEqual([]);
	});

	it("answers 404 for a cancelled occurrence and for an unknown event", async () => {
		const user = await seedCalendarAndEvent({
			recurrenceFrequency: 'weekly',
			recurrenceInterval: 1,
			recurrenceCount: 3
		});
		await seedExceptionRow({
			eventId: EVENT,
			originalDate: '2026-10-12T09:00:00.000Z',
			isCancelled: true
		});

		const cancelled = await invoke(getEventIcs, {
			ctx: ctx(),
			user,
			params: { id: `${EVENT}~2026-10-12T09:00:00.000Z` }
		});
		expect(cancelled.status).toBe(404);
		expect(cancelled.text).toBe('Event not found');

		const missing = await invoke(getEventIcs, {
			ctx: ctx(),
			user,
			params: { id: 'missingevent1' }
		});
		expect(missing.status).toBe(404);
		expect(missing.text).toBe('Event not found');
	});

	it("answers 400 'Invalid event id' and 403 'Event not accessible' as plain text", async () => {
		const user = await seedCalendarAndEvent();
		const stranger = await seedUser(testDb());

		const invalid = await invoke(getEventIcs, { ctx: ctx(), user, params: { id: 'no' } });
		expect(invalid.status).toBe(400);
		expect(invalid.text).toBe('Invalid event id');

		const denied = await invoke(getEventIcs, {
			ctx: ctx(),
			user: stranger,
			params: { id: 'evtoneoff01' }
		});
		expect(denied.status).toBe(403);
		expect(denied.text).toBe('Event not accessible');
	});
});
