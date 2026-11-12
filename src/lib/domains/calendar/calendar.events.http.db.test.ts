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

/** The response body as an object; a non-object body says what came back instead. */
function objectBody(res: InvokeResult): JsonObject {
	const body = res.body;
	if (body === null || typeof body !== 'object' || Array.isArray(body)) {
		throw new Error(`expected a JSON object body, got: ${res.text.slice(0, 200)}`);
	}
	return { ...body };
}

/** A nested object field, or a failure naming it. */
function objectValue(value: JsonValue | undefined, label: string): JsonObject {
	if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(`expected '${label}' to be an object`);
	}
	return { ...value };
}

function arrayField(body: JsonObject, key: string): JsonValue[] {
	const value = body[key];
	if (!Array.isArray(value)) throw new Error(`expected '${key}' to be an array`);
	return [...value];
}

type EventSeed = {
	id: string;
	ownerId: string;
	calendarId?: string | null;
	title: string;
	start: string;
	end?: string | null;
	description?: string | null;
	location?: string | null;
	allDay?: boolean;
	recurrenceFrequency?: string | null;
	recurrenceInterval?: number | null;
	recurrenceByDay?: string[] | null;
	recurrenceCount?: number | null;
	recurrenceUntil?: string | null;
	reminderMinutes?: number | null;
	mirrorOf?: string | null;
};

async function seedCalendar(id: string, input: { ownerId?: string; familyId?: string } = {}) {
	const [row] = await testDb()
		.insert(calendars)
		.values({ id, ownerId: input.ownerId ?? null, familyId: input.familyId ?? null })
		.returning();
	return row;
}

async function seedEvent(seed: EventSeed) {
	const [row] = await testDb().insert(events).values(seed).returning();
	return row;
}

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
		await seedCalendar(PERSONAL_CAL, { ownerId: user.id });
		await seedEvent({
			id: 'evtoneoff01',
			ownerId: user.id,
			calendarId: PERSONAL_CAL,
			title: 'Soccer practice',
			start: '2026-10-05T09:00:00.000Z',
			end: '2026-10-05T10:00:00.000Z'
		});
		await seedEvent({
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
		await seedCalendar(PERSONAL_CAL, { ownerId: viewer.id });
		await seedCalendar(FAMILY_CAL, { familyId: FAMILY });
		await seedCalendar('cal-stranger1', { ownerId: stranger.id });
		await seedEvent({
			id: 'evtpartner1',
			ownerId: partner.id,
			calendarId: FAMILY_CAL,
			title: 'Family dinner',
			start: '2026-10-09T18:00:00.000Z'
		});
		await seedEvent({
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
		await seedCalendar(PERSONAL_CAL, { ownerId: user.id });

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
		expect(res.body).toEqual({
			success: true,
			event: {
				id: expect.stringMatching(/^[a-z0-9]{15}$/),
				calendarId: PERSONAL_CAL,
				ownerId: user.id,
				title: 'Dentist',
				start: '2026-10-07T13:00:00.000Z',
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
		await seedCalendar(PERSONAL_CAL, { ownerId: user.id });

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
		await seedCalendar(PERSONAL_CAL, { ownerId: user.id });
		await seedCalendar(FAMILY_CAL, { familyId: FAMILY });
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

	it('does not mirror when the setting is off', async () => {
		const user = await seedUser(testDb());
		await seedCalendar(PERSONAL_CAL, { ownerId: user.id });

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
		await seedCalendar(PERSONAL_CAL, { ownerId: user.id });
		await seedCalendar('cal-stranger1', { ownerId: stranger.id });

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

	it('answers 500 {"error":"Failed to create event"} when the row cannot be written', async () => {
		const user = await seedUser(testDb());
		await seedCalendar(PERSONAL_CAL, { ownerId: user.id });

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
		await seedCalendar(PERSONAL_CAL, { ownerId: user.id });
		await seedEvent({
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
				start: START,
				end: END,
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
			event: expect.objectContaining({
				id: EVENT,
				title: 'Dentist',
				location: 'Clinic',
				description: 'Bring forms',
				start: '2026-10-08T13:00:00.000Z',
				end: '2026-10-08T14:00:00.000Z',
				reminderMinutes: 30
			})
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
			event: expect.objectContaining({
				title: 'Piano lesson',
				recurrenceFrequency: null,
				recurrenceInterval: null,
				recurrenceByDay: null,
				recurrenceCount: null,
				recurrenceUntil: null
			})
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
		const attendance = await testDb().select().from(eventAttendance);
		expect(attendance).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ eventId: EVENT, userId: user.id, status: 'going' }),
				expect.objectContaining({ eventId: EVENT, name: 'Grandma' })
			])
		);
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
		await testDb().insert(eventExceptions).values({
			eventId: EVENT,
			originalDate: '2026-10-13T15:00:00.000Z',
			isCancelled: true
		});

		const res = await invoke(putEvent, {
			ctx: ctx(),
			user,
			method: 'PUT',
			params: { id: EVENT },
			body: { start: '2026-10-08T15:00:00.000Z' }
		});

		expect(res.status).toBe(200);
		const exceptions = await testDb().select().from(eventExceptions);
		expect(storedIso(exceptions[0]?.originalDate)).toBe('2026-10-15T15:00:00.000Z');
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
		await seedCalendar(FAMILY_CAL, { familyId: FAMILY });
		await seedEvent({
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
		await seedCalendar('cal-stranger1', { ownerId: stranger.id });

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

	it("answers 400 'Invalid event id' for an id that is not a master id", async () => {
		const user = await seedUser(testDb());
		for (const id of ['no', 'abc~2026-10-07T13:00:00.000Z', 'evtoneoff01~nope']) {
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
	});

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
		await seedCalendar(PERSONAL_CAL, { ownerId: user.id });
		await seedCalendar(FAMILY_CAL, { familyId: FAMILY });
		await seedEvent({
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
			await seedEvent({
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
			await testDb().insert(eventExceptions).values({
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
		await seedCalendar(PERSONAL_CAL, { ownerId: user.id });
		await seedEvent({
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
		await seedCalendar(PERSONAL_CAL, { ownerId: user.id });
		await seedEvent({
			id: EVENT,
			ownerId: user.id,
			calendarId: PERSONAL_CAL,
			title: 'Dentist',
			start: '2026-10-07T13:00:00.000Z'
		});
		await testDb()
			.insert(eventAttendance)
			.values([
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
		await seedCalendar(FAMILY_CAL, { familyId: FAMILY });
		await seedEvent({
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
});

describe('POST /api/events/[id]/rsvp', () => {
	const EVENT = 'evtoneoff01';

	async function seedEvent() {
		const user = await seedUser(testDb(), { firstName: 'Mia', lastName: 'Rivera' });
		await seedCalendar(PERSONAL_CAL, { ownerId: user.id });
		await seedEvent({
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
		const user = await seedEvent();

		const res = await invoke(postRsvp, {
			ctx: ctx(),
			user,
			method: 'POST',
			params: { id: EVENT },
			body: { status: 'maybe' }
		});

		expect(res.status).toBe(200);
		const body = objectBody(res);
		expect(body.success).toBe(true);
		// Legacy quirk kept on purpose: `rsvpStatus` is the raw attendance rows,
		// not a single status (getEventRsvpStatus selects every row).
		expect(arrayField(body, 'rsvpStatus')).toHaveLength(1);
		expect(arrayField(body, 'rsvpStatus')[0]).toEqual(
			expect.objectContaining({
				eventId: EVENT,
				userId: user.id,
				name: null,
				status: 'maybe',
				inviteType: 'optional'
			})
		);
		expect(arrayField(body, 'attendance')[0]).toEqual(
			expect.objectContaining({ userId: user.id, status: 'maybe', firstName: 'Mia' })
		);

		const rows = await testDb().select().from(eventAttendance);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.status).toBe('maybe');
	});

	it('clearing the answer stores undecided', async () => {
		const user = await seedEvent();

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
		const user = await seedEvent();

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
		const user = await seedEvent();

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

	it("answers 400 'Guest name is required' for a blank or non-string guest", async () => {
		const user = await seedEvent();

		for (const guest of ['   ', 5]) {
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
	});

	it("answers 404 'Event not found' and 403 'No access to this event'", async () => {
		await seedEvent();
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
		await seedCalendar(PERSONAL_CAL, { ownerId: user.id });
		await seedEvent({
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
		await testDb().insert(eventExceptions).values({
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

	it("answers 404 for a cancelled occurrence and for an unknown event", async () => {
		const user = await seedCalendarAndEvent({
			recurrenceFrequency: 'weekly',
			recurrenceInterval: 1,
			recurrenceCount: 3
		});
		await testDb().insert(eventExceptions).values({
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
