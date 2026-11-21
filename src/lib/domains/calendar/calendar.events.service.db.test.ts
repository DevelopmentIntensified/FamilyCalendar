/**
 * The calendar event services against real Postgres: one test per behaviour the
 * goldens and the README Invariants pin, each in `rollbackTest` so every row it
 * seeds vanishes afterwards.
 *
 * Expected values come from the legacy handlers (`src/routes/api/events/
 * +server.ts`, `[id]/+server.ts`, `eventDisplayService.ts`, `events.ts`) and
 * the frozen `calendar.events.http.db.test.ts` — never from running this code.
 * The ctx carries a fixed clock, so nothing reads the process clock; the
 * `events_changed` nudge is asserted through the memory push port.
 *
 * Doc: ./README.md#how-to-test
 */
import { eq } from 'drizzle-orm';
import { describe, expect, vi } from 'vitest';
import { actorFromUser } from '$lib/kernel/ctx/actor';
import type { Db } from '$lib/kernel/db/database.server';
import {
	deviceTokens,
	eventAttendance,
	eventExceptions,
	events,
	userSettings
} from '$lib/kernel/db/tables.server';
import { createMemoryPush } from '$lib/kernel/push/push';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx, type TestCtx } from '$lib/kernel/testing/testCtx.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { seedFamily, seedMembership } from '$lib/domains/family/family.fixtures.server';
import {
	seedCalendarRow,
	seedEventRow,
	seedExceptionRow,
	seedRecurringEventRow,
	type CalendarEventSeed
} from './calendar.fixtures.server';
import {
	createEvent,
	deleteEvent,
	getEventForViewer,
	listEventsInWindow,
	updateEvent
} from './calendar.events.service.server';

const NOW = '2026-03-01T09:00:00.000Z';
const PERSONAL = 'calperson0001';
const FAMILY_CAL = 'calfamily0001';
const FAMILY = 'fam-1';
const OTHER_CAL = 'calstranger01';

const storedIso = (value: unknown) => new Date(String(value)).toISOString();

/** A ctx whose device channel is on, so the nudge resolves its audience. */
function pushCtx(db: Db): TestCtx {
	return { ...testCtx({ db, now: NOW }), push: createMemoryPush({ devicesConfigured: true }) };
}

describe('listEventsInWindow', () => {
	rollbackTest('expands the range into occurrences with rsvp, attendance and creator', async (db) => {
		const viewer = await seedUser(db, { firstName: 'Mia' });
		await seedCalendarRow(PERSONAL, { ownerId: viewer.id }, db);
		await seedEventRow(
			{
				id: 'evtoneoff01',
				ownerId: viewer.id,
				calendarId: PERSONAL,
				title: 'Soccer practice',
				start: '2026-10-05T09:00:00.000Z',
				end: '2026-10-05T10:00:00.000Z'
			},
			db
		);
		await seedRecurringEventRow(
			{
				id: 'evtweekly01',
				ownerId: viewer.id,
				calendarId: PERSONAL,
				title: 'Piano',
				start: '2026-10-06T15:00:00.000Z',
				end: '2026-10-06T16:00:00.000Z',
				count: 3
			},
			db
		);
		await db.insert(eventAttendance).values({
			eventId: 'evtoneoff01',
			userId: viewer.id,
			status: 'going',
			inviteType: 'optional'
		});

		const result = await listEventsInWindow(
			testCtx({ db, now: NOW }),
			actorFromUser(viewer, 'session'),
			{ from: '2026-10-01', to: '2026-10-31' }
		);

		expect(result.window).toEqual({ from: '2026-10-01', to: '2026-10-31' });
		// Masters in start order, each master's occurrences in slot order.
		expect(result.events.map((event) => event.id)).toEqual([
			'evtoneoff01~2026-10-05T09:00:00.000Z',
			'evtweekly01~2026-10-06T15:00:00.000Z',
			'evtweekly01~2026-10-13T15:00:00.000Z',
			'evtweekly01~2026-10-20T15:00:00.000Z'
		]);
		expect(result.events[0]).toMatchObject({
			start: '2026-10-05T09:00:00.000Z',
			end: '2026-10-05T10:00:00.000Z',
			date: '2026-10-05T09:00:00.000Z',
			masterId: 'evtoneoff01',
			occurrenceDate: '2026-10-05T09:00:00.000Z',
			rsvpStatus: 'going',
			attendance: { going: 1, invited: 1, required: 0, requiredPending: 0, goingNames: ['Mia'] },
			creatorName: 'Mia'
		});
		expect(result.events[0].created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
		// No RSVP row and nobody invited: the two fields are ABSENT, not null.
		expect(result.events[1].rsvpStatus).toBeUndefined();
		expect(result.events[1].attendance).toBeUndefined();
	});

	rollbackTest('splits a multi-day event into one entry per day, all sharing the id', async (db) => {
		const viewer = await seedUser(db);
		await seedCalendarRow(PERSONAL, { ownerId: viewer.id }, db);
		await seedEventRow(
			{
				id: 'evtmulti0001',
				ownerId: viewer.id,
				calendarId: PERSONAL,
				title: 'Camping',
				start: '2026-10-05T22:00:00.000Z',
				end: '2026-10-07T02:00:00.000Z'
			},
			db
		);

		const result = await listEventsInWindow(
			testCtx({ db, now: NOW }),
			actorFromUser(viewer, 'session'),
			{ from: '2026-10-01', to: '2026-10-31' }
		);

		expect(result.events.map((event) => [event.start, event.date, event.end])).toEqual([
			['2026-10-05T22:00:00.000Z', '2026-10-05T22:00:00.000Z', '2026-10-07T02:00:00.000Z'],
			['2026-10-06T22:00:00.000Z', '2026-10-06T22:00:00.000Z', '2026-10-07T02:00:00.000Z'],
			['2026-10-07T22:00:00.000Z', '2026-10-07T22:00:00.000Z', '2026-10-07T02:00:00.000Z']
		]);
		expect([...new Set(result.events.map((event) => event.id))]).toEqual([
			'evtmulti0001~2026-10-05T22:00:00.000Z'
		]);
	});

	rollbackTest('serves the padded week and reads every family calendar (#098)', async (db) => {
		const viewer = await seedUser(db, { firstName: 'Mia' });
		const partner = await seedUser(db, { firstName: 'Sam' });
		const stranger = await seedUser(db, { firstName: 'Ari' });
		await seedFamily(FAMILY, { name: 'Riveras' }, db);
		await seedMembership(FAMILY, viewer.id, 'creator', 'parent', db);
		await seedMembership(FAMILY, partner.id, 'member', 'member', db);
		await seedCalendarRow(PERSONAL, { ownerId: viewer.id }, db);
		await seedCalendarRow(FAMILY_CAL, { familyId: FAMILY }, db);
		await seedCalendarRow(OTHER_CAL, { ownerId: stranger.id }, db);
		// Ends the day before the padded window opens (Sep 24 00:00Z).
		await seedEventRow(
			{
				id: 'evtoutside01',
				ownerId: viewer.id,
				calendarId: PERSONAL,
				title: 'Before the padding',
				start: '2026-09-23T22:00:00.000Z',
				end: '2026-09-23T23:00:00.000Z'
			},
			db
		);
		await seedEventRow(
			{
				id: 'evtpadding01',
				ownerId: viewer.id,
				calendarId: PERSONAL,
				title: 'On the padding edge',
				start: '2026-09-24T00:00:00.000Z',
				end: '2026-09-24T01:00:00.000Z'
			},
			db
		);
		await seedEventRow(
			{
				id: 'evtpartner1',
				ownerId: partner.id,
				calendarId: FAMILY_CAL,
				title: 'Family dinner',
				start: '2026-10-09T18:00:00.000Z'
			},
			db
		);
		await seedEventRow(
			{
				id: 'evtstrange1',
				ownerId: stranger.id,
				calendarId: OTHER_CAL,
				title: 'Not mine',
				start: '2026-10-10T18:00:00.000Z'
			},
			db
		);

		const result = await listEventsInWindow(
			testCtx({ db, now: NOW }),
			actorFromUser(viewer, 'session'),
			{ from: '2026-10-01', to: '2026-10-31' }
		);

		expect(result.events.map((event) => event.id)).toEqual([
			'evtpadding01~2026-09-24T00:00:00.000Z',
			'evtpartner1~2026-10-09T18:00:00.000Z'
		]);
		expect(result.events[1].creatorName).toBe('Sam');
	});
});

describe('createEvent', () => {
	rollbackTest('uses the personal calendar, auto-RSVPs the creator and stores guest names', async (db) => {
		const viewer = await seedUser(db, { firstName: 'Mia' });
		await seedCalendarRow(PERSONAL, { ownerId: viewer.id }, db);

		const created = await createEvent(testCtx({ db, now: NOW }), actorFromUser(viewer, 'session'), {
			title: 'Dentist',
			start: '2026-10-07T13:00:00.000Z',
			attendants: ['Grandma', '   ']
		});

		expect(created.calendarId).toBe(PERSONAL);
		expect(created.ownerId).toBe(viewer.id);
		expect(created.title).toBe('Dentist');
		expect(storedIso(created.start)).toBe('2026-10-07T13:00:00.000Z');
		expect(created.end).toBeNull();
		expect(created.description).toBeNull();
		expect(created.allDay).toBe(false);
		expect(created.recurrenceFrequency).toBeNull();
		expect(created.mirrorOf).toBeNull();

		const attendance = await db.select().from(eventAttendance);
		expect(attendance).toHaveLength(2);
		expect(attendance).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					userId: viewer.id,
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

	rollbackTest('mirrors onto the family calendar when syncEventsToFamilyCalendar is on', async (db) => {
		const viewer = await seedUser(db, { firstName: 'Mia' });
		await seedFamily(FAMILY, { name: 'Riveras' }, db);
		await seedMembership(FAMILY, viewer.id, 'creator', 'parent', db);
		await seedCalendarRow(PERSONAL, { ownerId: viewer.id }, db);
		await seedCalendarRow(FAMILY_CAL, { familyId: FAMILY }, db);
		await db.insert(userSettings).values({
			userId: viewer.id,
			syncEventsToFamilyCalendar: true
		});

		const created = await createEvent(testCtx({ db, now: NOW }), actorFromUser(viewer, 'session'), {
			title: 'Recital',
			start: '2026-10-09T16:00:00.000Z',
			attendants: ['Grandma']
		});

		const rows = await db.select().from(events);
		expect(rows).toHaveLength(2);
		const mirror = rows.find((row) => row.mirrorOf !== null);
		expect(mirror).toEqual(
			expect.objectContaining({
				calendarId: FAMILY_CAL,
				ownerId: viewer.id,
				title: 'Recital',
				mirrorOf: created.id
			})
		);
		expect(storedIso(mirror?.start)).toBe('2026-10-09T16:00:00.000Z');
		// The copy is a full Event write: its own creator RSVP plus the same guest.
		const mirrorAttendance = await db
			.select()
			.from(eventAttendance)
			.where(eq(eventAttendance.eventId, String(mirror?.id)));
		expect(mirrorAttendance).toHaveLength(2);
	});

	rollbackTest('refuses a calendar the viewer cannot see', async (db) => {
		const viewer = await seedUser(db);
		const stranger = await seedUser(db);
		await seedCalendarRow(PERSONAL, { ownerId: viewer.id }, db);
		await seedCalendarRow(OTHER_CAL, { ownerId: stranger.id }, db);

		await expect(
			createEvent(testCtx({ db, now: NOW }), actorFromUser(viewer, 'session'), {
				title: 'Recital',
				start: '2026-10-09T16:00:00.000Z',
				calendarId: OTHER_CAL
			})
		).rejects.toMatchObject({ status: 403, message: 'Calendar not accessible' });
		expect(await db.select().from(events)).toEqual([]);
	});

	rollbackTest('sends exactly ONE events_changed nudge to the family audience', async (db) => {
		const viewer = await seedUser(db, { firstName: 'Mia' });
		const partner = await seedUser(db, { firstName: 'Sam' });
		await seedFamily(FAMILY, { name: 'Riveras' }, db);
		await seedMembership(FAMILY, viewer.id, 'creator', 'parent', db);
		await seedMembership(FAMILY, partner.id, 'member', 'member', db);
		await seedCalendarRow(PERSONAL, { ownerId: viewer.id }, db);
		await seedCalendarRow(FAMILY_CAL, { familyId: FAMILY }, db);
		await db.insert(deviceTokens).values({ userId: partner.id, token: 'token-partner' });

		const ctx = pushCtx(db);
		await createEvent(ctx, actorFromUser(viewer, 'session'), {
			title: 'Recital',
			start: '2026-10-09T16:00:00.000Z'
		});

		await vi.waitFor(() => expect(ctx.push.sent).toHaveLength(1));
		expect(ctx.push.sent[0]).toEqual({
			channel: 'device',
			token: 'token-partner',
			body: {
				data: { type: 'events_changed', actorId: viewer.id },
				android: { priority: 'high', collapse_key: 'events_changed', ttl: '600s' }
			}
		});
	});
});

describe('updateEvent', () => {
	const EVENT = 'evtoneoff01';
	const START = '2026-10-07T13:00:00.000Z';
	const END = '2026-10-07T14:00:00.000Z';

	async function seedOwnedEvent(db: Db, overrides: Partial<CalendarEventSeed> = {}) {
		const viewer = await seedUser(db, { firstName: 'Mia' });
		await seedCalendarRow(PERSONAL, { ownerId: viewer.id }, db);
		await seedEventRow(
			{
				id: EVENT,
				ownerId: viewer.id,
				calendarId: PERSONAL,
				title: 'Dentist',
				start: START,
				end: END,
				description: 'Bring forms',
				location: 'Clinic',
				reminderMinutes: 30,
				...overrides
			},
			db
		);
		return viewer;
	}

	rollbackTest('keeps omitted fields and clears an explicit null or empty string (#228)', async (db) => {
		const viewer = await seedOwnedEvent(db);

		const result = await updateEvent(
			testCtx({ db, now: NOW }),
			actorFromUser(viewer, 'session'),
			EVENT,
			{ location: '', description: null, reminderMinutes: null }
		);

		expect(result.kind).toBe('event');
		if (result.kind !== 'event') return;
		expect(result.event.title).toBe('Dentist');
		expect(storedIso(result.event.start)).toBe(START);
		expect(storedIso(result.event.end)).toBe(END);
		expect(result.event.description).toBeNull();
		expect(result.event.location).toBeNull();
		expect(result.event.reminderMinutes).toBeNull();
	});

	rollbackTest('clears recurrence when a partial body omits it (Q-047)', async (db) => {
		const viewer = await seedOwnedEvent(db, {
			title: 'Piano',
			recurrenceFrequency: 'weekly',
			recurrenceInterval: 2,
			recurrenceCount: 5
		});

		const result = await updateEvent(
			testCtx({ db, now: NOW }),
			actorFromUser(viewer, 'session'),
			EVENT,
			{ title: 'Piano lesson' }
		);

		expect(result.kind).toBe('event');
		if (result.kind !== 'event') return;
		expect(result.event.title).toBe('Piano lesson');
		expect(result.event.recurrenceFrequency).toBeNull();
		expect(result.event.recurrenceInterval).toBeNull();
		expect(result.event.recurrenceCount).toBeNull();
	});

	rollbackTest("scope 'this' writes an Exception Override and answers the note", async (db) => {
		const viewer = await seedOwnedEvent(db, {
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

		const result = await updateEvent(
			testCtx({ db, now: NOW }),
			actorFromUser(viewer, 'session'),
			`${EVENT}~2026-10-13T15:00:00.000Z`,
			{ scope: 'this', title: 'Piano (moved)', start: '2026-10-13T17:00:00.000Z' }
		);

		expect(result).toEqual({ kind: 'series-note' });
		const exceptions = await db.select().from(eventExceptions);
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
	});

	rollbackTest("scope 'this' merges a second edit and un-cancels the slot", async (db) => {
		const viewer = await seedOwnedEvent(db, {
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
		await seedExceptionRow(
			{ eventId: EVENT, originalDate: '2026-10-13T15:00:00.000Z', isCancelled: true },
			db
		);
		const ctx = testCtx({ db, now: NOW });
		const actor = actorFromUser(viewer, 'session');

		await updateEvent(ctx, actor, `${EVENT}~2026-10-13T15:00:00.000Z`, {
			scope: 'this',
			title: 'Piano (back)',
			location: 'Studio'
		});
		await updateEvent(ctx, actor, `${EVENT}~2026-10-13T15:00:00.000Z`, {
			scope: 'this',
			start: '2026-10-13T17:00:00.000Z'
		});

		const exceptions = await db.select().from(eventExceptions);
		expect(exceptions).toHaveLength(1);
		expect(exceptions[0]).toEqual(
			expect.objectContaining({
				isCancelled: false,
				title: 'Piano (back)',
				location: 'Studio'
			})
		);
		expect(storedIso(exceptions[0]?.start)).toBe('2026-10-13T17:00:00.000Z');
		expect(exceptions[0]?.end).toBeNull();
	});

	rollbackTest("scope 'this' on a bare recurring master needs an occurrenceDate", async (db) => {
		const viewer = await seedOwnedEvent(db, {
			recurrenceFrequency: 'weekly',
			recurrenceInterval: 1,
			recurrenceCount: 3
		});

		await expect(
			updateEvent(testCtx({ db, now: NOW }), actorFromUser(viewer, 'session'), EVENT, {
				scope: 'this',
				title: 'Renamed'
			})
		).rejects.toMatchObject({ status: 400, message: 'A valid occurrenceDate is required' });
	});

	rollbackTest("lets a family member rewrite and cancel another member's occurrence", async (db) => {
		const owner = await seedUser(db);
		const partner = await seedUser(db);
		await seedFamily(FAMILY, { name: 'Riveras' }, db);
		await seedMembership(FAMILY, owner.id, 'creator', 'parent', db);
		await seedMembership(FAMILY, partner.id, 'member', 'member', db);
		await seedCalendarRow(FAMILY_CAL, { familyId: FAMILY }, db);
		await seedRecurringEventRow(
			{
				id: EVENT,
				ownerId: owner.id,
				calendarId: FAMILY_CAL,
				title: 'Piano',
				start: '2026-10-06T15:00:00.000Z',
				end: '2026-10-06T16:00:00.000Z',
				count: 3
			},
			db
		);
		const ctx = testCtx({ db, now: NOW });
		const actor = actorFromUser(partner, 'session');

		// The occurrence leg needs READ access only (pinned as today).
		const rewrite = await updateEvent(ctx, actor, `${EVENT}~2026-10-13T15:00:00.000Z`, {
			scope: 'this',
			title: 'Piano (partner)'
		});
		expect(rewrite).toEqual({ kind: 'series-note' });
		await deleteEvent(ctx, actor, `${EVENT}~2026-10-20T15:00:00.000Z`, { scope: 'this' });

		// The owner leg still guards the series itself.
		await expect(
			updateEvent(ctx, actor, EVENT, { title: 'Hijacked' })
		).rejects.toMatchObject({ status: 404, message: 'Event not found' });

		const exceptions = await db
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

	rollbackTest("moving a recurring master's start shifts every override slot", async (db) => {
		const viewer = await seedOwnedEvent(db, {
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
		await seedExceptionRow(
			{ eventId: EVENT, originalDate: '2026-10-13T15:00:00.000Z', isCancelled: true },
			db
		);
		await seedExceptionRow(
			{
				eventId: EVENT,
				originalDate: '2026-10-20T15:00:00.000Z',
				start: '2026-10-20T17:00:00.000Z',
				end: '2026-10-20T18:30:00.000Z',
				title: 'Piano (moved)'
			},
			db
		);

		await updateEvent(testCtx({ db, now: NOW }), actorFromUser(viewer, 'session'), EVENT, {
			start: '2026-10-08T15:00:00.000Z'
		});

		const exceptions = await db
			.select()
			.from(eventExceptions)
			.orderBy(eventExceptions.originalDate);
		expect(exceptions).toHaveLength(2);
		expect(storedIso(exceptions[0]?.originalDate)).toBe('2026-10-15T15:00:00.000Z');
		expect(storedIso(exceptions[1]?.originalDate)).toBe('2026-10-22T15:00:00.000Z');
		expect(storedIso(exceptions[1]?.start)).toBe('2026-10-22T17:00:00.000Z');
		expect(storedIso(exceptions[1]?.end)).toBe('2026-10-22T18:30:00.000Z');
	});

	rollbackTest('propagates a master edit to its mirror and leaves the mirror calendar alone', async (db) => {
		const viewer = await seedUser(db, { firstName: 'Mia' });
		await seedFamily(FAMILY, { name: 'Riveras' }, db);
		await seedMembership(FAMILY, viewer.id, 'creator', 'parent', db);
		await seedCalendarRow(PERSONAL, { ownerId: viewer.id }, db);
		await seedCalendarRow(FAMILY_CAL, { familyId: FAMILY }, db);
		await seedEventRow(
			{
				id: EVENT,
				ownerId: viewer.id,
				calendarId: PERSONAL,
				title: 'Piano',
				start: '2026-10-06T15:00:00.000Z',
				end: '2026-10-06T16:00:00.000Z'
			},
			db
		);
		await seedEventRow(
			{
				id: 'evtmirror001',
				ownerId: viewer.id,
				calendarId: FAMILY_CAL,
				title: 'Piano',
				start: '2026-10-06T15:00:00.000Z',
				end: '2026-10-06T16:00:00.000Z',
				mirrorOf: EVENT
			},
			db
		);

		await updateEvent(testCtx({ db, now: NOW }), actorFromUser(viewer, 'session'), EVENT, {
			title: 'Piano lesson',
			start: '2026-10-06T17:00:00.000Z',
			end: '2026-10-06T18:30:00.000Z',
			location: 'Studio'
		});

		const [mirror] = await db.select().from(events).where(eq(events.id, 'evtmirror001'));
		expect(mirror).toEqual(
			expect.objectContaining({
				calendarId: FAMILY_CAL,
				title: 'Piano lesson',
				location: 'Studio',
				mirrorOf: EVENT
			})
		);
		expect(storedIso(mirror?.start)).toBe('2026-10-06T17:00:00.000Z');
		expect(storedIso(mirror?.end)).toBe('2026-10-06T18:30:00.000Z');
	});

	rollbackTest('answers 404 for a reader without the owner leg and 403 for a foreign calendar', async (db) => {
		const owner = await seedUser(db);
		const partner = await seedUser(db);
		const stranger = await seedUser(db);
		await seedFamily(FAMILY, { name: 'Riveras' }, db);
		await seedMembership(FAMILY, owner.id, 'creator', 'parent', db);
		await seedMembership(FAMILY, partner.id, 'member', 'member', db);
		await seedCalendarRow(FAMILY_CAL, { familyId: FAMILY }, db);
		await seedCalendarRow(OTHER_CAL, { ownerId: stranger.id }, db);
		await seedEventRow(
			{
				id: EVENT,
				ownerId: owner.id,
				calendarId: FAMILY_CAL,
				title: 'Dentist',
				start: START,
				end: END
			},
			db
		);
		const ctx = testCtx({ db, now: NOW });

		await expect(
			updateEvent(ctx, actorFromUser(partner, 'session'), EVENT, { title: 'Hijacked' })
		).rejects.toMatchObject({ status: 404, message: 'Event not found' });
		const [unchanged] = await db.select().from(events).where(eq(events.id, EVENT));
		expect(unchanged?.title).toBe('Dentist');

		const viewer = await seedUser(db);
		await seedCalendarRow(PERSONAL, { ownerId: viewer.id }, db);
		await seedEventRow(
			{ id: 'evtown00001', ownerId: viewer.id, calendarId: PERSONAL, title: 'Mine', start: START },
			db
		);
		await expect(
			updateEvent(ctx, actorFromUser(viewer, 'session'), 'evtown00001', {
				calendarId: OTHER_CAL
			})
		).rejects.toMatchObject({ status: 403, message: 'Calendar not accessible' });
	});
});

describe('deleteEvent', () => {
	const EVENT = 'evtrecurring1';

	async function seedSeries(db: Db, options: { mirror?: boolean; cancelled?: boolean } = {}) {
		const viewer = await seedUser(db);
		await seedFamily(FAMILY, { name: 'Riveras' }, db);
		await seedMembership(FAMILY, viewer.id, 'creator', 'parent', db);
		await seedCalendarRow(PERSONAL, { ownerId: viewer.id }, db);
		await seedCalendarRow(FAMILY_CAL, { familyId: FAMILY }, db);
		await seedRecurringEventRow(
			{
				id: EVENT,
				ownerId: viewer.id,
				calendarId: PERSONAL,
				title: 'Piano',
				start: '2026-10-06T15:00:00.000Z',
				end: '2026-10-06T16:00:00.000Z',
				count: 3
			},
			db
		);
		if (options.mirror) {
			await seedEventRow(
				{
					id: 'evtmirror001',
					ownerId: viewer.id,
					calendarId: FAMILY_CAL,
					title: 'Piano',
					start: '2026-10-06T15:00:00.000Z',
					mirrorOf: EVENT
				},
				db
			);
		}
		if (options.cancelled) {
			await seedExceptionRow(
				{ eventId: EVENT, originalDate: '2026-10-13T15:00:00.000Z', isCancelled: true },
				db
			);
		}
		return viewer;
	}

	rollbackTest('a bare DELETE removes the master, its mirror and its overrides', async (db) => {
		const viewer = await seedSeries(db, { mirror: true, cancelled: true });

		await deleteEvent(testCtx({ db, now: NOW }), actorFromUser(viewer, 'session'), EVENT, {});

		expect(await db.select().from(events)).toEqual([]);
		expect(await db.select().from(eventExceptions)).toEqual([]);
	});

	rollbackTest("scope 'this' on a recurring occurrence cancels it and keeps the series", async (db) => {
		const viewer = await seedSeries(db);

		await deleteEvent(
			testCtx({ db, now: NOW }),
			actorFromUser(viewer, 'session'),
			`${EVENT}~2026-10-13T15:00:00.000Z`,
			{ scope: 'this' }
		);

		expect(await db.select().from(events)).toHaveLength(1);
		const exceptions = await db.select().from(eventExceptions);
		expect(exceptions).toHaveLength(1);
		expect(exceptions[0]).toEqual(expect.objectContaining({ eventId: EVENT, isCancelled: true }));
		expect(storedIso(exceptions[0]?.originalDate)).toBe('2026-10-13T15:00:00.000Z');
	});

	rollbackTest("scope 'this' on a one-off removes that event", async (db) => {
		const viewer = await seedUser(db);
		await seedCalendarRow(PERSONAL, { ownerId: viewer.id }, db);
		await seedEventRow(
			{
				id: 'evtoneoff01',
				ownerId: viewer.id,
				calendarId: PERSONAL,
				title: 'Dentist',
				start: '2026-10-07T13:00:00.000Z'
			},
			db
		);

		await deleteEvent(
			testCtx({ db, now: NOW }),
			actorFromUser(viewer, 'session'),
			'evtoneoff01',
			{ scope: 'this' }
		);

		expect(await db.select().from(events)).toEqual([]);
	});

	rollbackTest("refuses a stranger's occurrence with 403 and the series with 404", async (db) => {
		await seedSeries(db);
		const stranger = await seedUser(db);
		const ctx = testCtx({ db, now: NOW });

		await expect(
			deleteEvent(ctx, actorFromUser(stranger, 'session'), `${EVENT}~2026-10-13T15:00:00.000Z`, {
				scope: 'this'
			})
		).rejects.toMatchObject({ status: 403, message: 'Event not accessible' });

		await expect(
			deleteEvent(ctx, actorFromUser(stranger, 'session'), EVENT, {})
		).rejects.toMatchObject({ status: 404, message: 'Event not found' });
		expect(await db.select().from(events)).toHaveLength(1);
	});
});

describe('getEventForViewer', () => {
	rollbackTest('answers the row with parsed dates and the viewer RSVP', async (db) => {
		const viewer = await seedUser(db);
		await seedCalendarRow(PERSONAL, { ownerId: viewer.id }, db);
		await seedEventRow(
			{
				id: 'evtoneoff01',
				ownerId: viewer.id,
				calendarId: PERSONAL,
				title: 'Dentist',
				start: '2026-10-07T13:00:00.000Z',
				end: '2026-10-07T14:00:00.000Z'
			},
			db
		);

		const detail = await getEventForViewer(
			testCtx({ db, now: NOW }),
			actorFromUser(viewer, 'session'),
			'evtoneoff01'
		);

		expect(detail.event.start).toBeInstanceOf(Date);
		expect(detail.event.end).toBeInstanceOf(Date);
		expect(detail.event.date.toISOString()).toBe('2026-10-07T13:00:00.000Z');
		expect(detail.calendar?.id).toBe(PERSONAL);
		expect(detail.attendance).toEqual([]);
		expect(detail.userRsvpStatus).toBe('undecided');
	});

	rollbackTest('answers 404 for an unknown id and 403 for a stranger', async (db) => {
		const owner = await seedUser(db);
		await seedCalendarRow(PERSONAL, { ownerId: owner.id }, db);
		await seedEventRow(
			{
				id: 'evtoneoff01',
				ownerId: owner.id,
				calendarId: PERSONAL,
				title: 'Dentist',
				start: '2026-10-07T13:00:00.000Z'
			},
			db
		);
		const stranger = await seedUser(db);
		const ctx = testCtx({ db, now: NOW });

		await expect(
			getEventForViewer(ctx, actorFromUser(stranger, 'session'), 'evtoneoff01')
		).rejects.toMatchObject({ status: 403, message: 'No access to this event' });
		await expect(
			getEventForViewer(ctx, actorFromUser(stranger, 'session'), 'missingevent1')
		).rejects.toMatchObject({ status: 404, message: 'Event not found' });
	});
});
