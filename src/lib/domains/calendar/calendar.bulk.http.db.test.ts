/**
 * Golden contract for the calendar's remaining endpoints (S2): the bulk edit,
 * the calendar list, the printable month and the location search. Written
 * against the legacy handlers and kept green through the port
 * (docs/rewrite/playbooks/characterize-endpoints.md).
 * Doc: ./README.md#how-to-test
 */
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	calendars,
	eventAttendance,
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
	type CalendarEventSeed
} from './calendar.fixtures.server';
import { GET as listCalendars } from '../../../routes/api/calendars/+server';
import { POST as bulkEdit } from '../../../routes/api/events/bulk/+server';
import { GET as searchLocations } from '../../../routes/api/location-search/+server';
import { GET as printMonth } from '../../../routes/api/print/+server';

const ctx = () => testCtx({ db: testDb() });

const PERSONAL_CAL = 'cal-personal01';
const FAMILY_CAL = 'cal-family01';
const FAMILY = 'fam-riveras01';

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

function arrayField(body: JsonObject, key: string): JsonValue[] {
	const value = body[key];
	if (!Array.isArray(value)) throw new Error(`expected '${key}' to be an array`);
	return [...value];
}

type EventSeed = Partial<CalendarEventSeed>;

async function seedMembership(familyId: string, userId: string) {
	await testDb().insert(familyMembers).values({ familyId, userId, role: 'member' });
}

async function seedOwnedEvent(seed: Partial<EventSeed> = {}) {
	const user = await seedUser(testDb(), { firstName: 'Mia' });
	await seedCalendarRow(PERSONAL_CAL, { ownerId: user.id });
	await seedEventRow({
		id: 'evtoneoff01',
		ownerId: user.id,
		calendarId: PERSONAL_CAL,
		title: 'Soccer practice',
		start: '2026-10-05T09:00:00.000Z',
		end: '2026-10-05T10:00:00.000Z',
		...seed
	});
	await seedEventRow({
		id: 'evtoneoff02',
		ownerId: user.id,
		calendarId: PERSONAL_CAL,
		title: 'Piano',
		start: '2026-10-06T15:00:00.000Z',
		end: '2026-10-06T16:00:00.000Z'
	});
	return user;
}

async function eventRows() {
	return await testDb()
		.select({ id: events.id, calendarId: events.calendarId, title: events.title, location: events.location })
		.from(events)
		.orderBy(events.id);
}

beforeEach(truncateAll);
afterEach(() => vi.unstubAllGlobals());

describe('POST /api/events/bulk', () => {
	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const res = await invoke(bulkEdit, {
			ctx: ctx(),
			path: '/api/events/bulk',
			body: { ids: [{ id: 'evtoneoff01' }], op: { type: 'delete' } }
		});

		expect(res.status).toBe(401);
		expect(res.body).toEqual({ error: 'Unauthorized' });
	});

	it('deletes every selected event, once each, and reports what applied', async () => {
		const user = await seedOwnedEvent();

		const res = await invoke(bulkEdit, {
			ctx: ctx(),
			user,
			path: '/api/events/bulk',
			body: {
				ids: [
					{ id: 'evtoneoff01' },
					{ id: 'evtoneoff01~2026-10-05T09:00:00.000Z' },
					{ id: 'evtoneoff02' }
				],
				op: { type: 'delete' }
			}
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true, applied: 2, failed: [] });
		expect(await testDb().select({ id: events.id }).from(events)).toEqual([]);
	});

	it('moves every selected event onto another accessible calendar', async () => {
		const user = await seedOwnedEvent();
		await seedCalendarRow('cal-second001', { ownerId: user.id });

		const res = await invoke(bulkEdit, {
			ctx: ctx(),
			user,
			path: '/api/events/bulk',
			body: {
				ids: [{ id: 'evtoneoff01' }, { id: 'evtoneoff02' }],
				op: { type: 'calendar', calendarId: 'cal-second001' }
			}
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true, applied: 2, failed: [] });
		expect((await eventRows()).map((row) => row.calendarId)).toEqual([
			'cal-second001',
			'cal-second001'
		]);
	});

	it("answers 400 'calendarId required' and 403 'Calendar not accessible' for a calendar move", async () => {
		const user = await seedOwnedEvent();
		const stranger = await seedUser(testDb());
		await seedCalendarRow('cal-stranger1', { ownerId: stranger.id });

		const missing = await invoke(bulkEdit, {
			ctx: ctx(),
			user,
			path: '/api/events/bulk',
			body: { ids: [{ id: 'evtoneoff01' }], op: { type: 'calendar' } }
		});
		expect(missing.status).toBe(400);
		expect(missing.body).toEqual({ error: 'calendarId required' });

		const denied = await invoke(bulkEdit, {
			ctx: ctx(),
			user,
			path: '/api/events/bulk',
			body: {
				ids: [{ id: 'evtoneoff01' }],
				op: { type: 'calendar', calendarId: 'cal-stranger1' }
			}
		});
		expect(denied.status).toBe(403);
		expect(denied.body).toEqual({ error: 'Calendar not accessible' });
	});

	it('sets the location on every selected event, and a blank location clears it', async () => {
		const user = await seedOwnedEvent({ location: 'Old field' });

		const res = await invoke(bulkEdit, {
			ctx: ctx(),
			user,
			path: '/api/events/bulk',
			body: {
				ids: [{ id: 'evtoneoff01' }, { id: 'evtoneoff02' }],
				op: { type: 'location', location: '  Park  ' }
			}
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true, applied: 2, failed: [] });
		expect((await eventRows()).map((row) => row.location)).toEqual(['Park', 'Park']);

		await invoke(bulkEdit, {
			ctx: ctx(),
			user,
			path: '/api/events/bulk',
			body: { ids: [{ id: 'evtoneoff01' }], op: { type: 'location', location: '   ' } }
		});
		expect((await eventRows()).map((row) => row.location)).toEqual([null, 'Park']);
	});

	it('merges guest names case-insensitively and needs at least one name', async () => {
		const user = await seedOwnedEvent();
		await seedAttendanceRow({
			eventId: 'evtoneoff01',
			name: 'Grandma',
			status: 'undecided',
			inviteType: 'optional'
		});

		const res = await invoke(bulkEdit, {
			ctx: ctx(),
			user,
			path: '/api/events/bulk',
			body: {
				ids: [{ id: 'evtoneoff01' }],
				op: { type: 'attendants', add: ['grandma', ' Bob ', ''] }
			}
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true, applied: 1, failed: [] });
		const guests = await testDb()
			.select({ name: eventAttendance.name })
			.from(eventAttendance)
			.where(eq(eventAttendance.eventId, 'evtoneoff01'));
		expect(guests.map((row) => row.name).sort()).toEqual(['Bob', 'Grandma']);

		const empty = await invoke(bulkEdit, {
			ctx: ctx(),
			user,
			path: '/api/events/bulk',
			body: { ids: [{ id: 'evtoneoff01' }], op: { type: 'attendants', add: [] } }
		});
		expect(empty.status).toBe(400);
		expect(empty.body).toEqual({ error: 'add names required' });
	});

	it('plans a smart edit deterministically from an absolute date (dryRun writes nothing)', async () => {
		const user = await seedOwnedEvent();
		await testDb().insert(userSettings).values({ userId: user.id, timeZone: 'utc' });

		const res = await invoke(bulkEdit, {
			ctx: ctx(),
			user,
			path: '/api/events/bulk',
			body: {
				ids: [{ id: 'evtoneoff01' }],
				op: { type: 'smart', instruction: 'move everything to 2026-10-06' },
				dryRun: true
			}
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			success: true,
			plan: [{ id: 'evtoneoff01', date: '2026-10-06' }]
		});
		const [row] = await testDb()
			.select({ start: events.start })
			.from(events)
			.where(eq(events.id, 'evtoneoff01'));
		expect(new Date(String(row?.start)).toISOString()).toBe('2026-10-05T09:00:00.000Z');
	});

	it('applies a smart date move in the viewer zone and keeps the time of day', async () => {
		const user = await seedOwnedEvent();
		await testDb().insert(userSettings).values({ userId: user.id, timeZone: 'utc' });

		const res = await invoke(bulkEdit, {
			ctx: ctx(),
			user,
			path: '/api/events/bulk',
			body: {
				ids: [{ id: 'evtoneoff01' }],
				op: { type: 'smart', instruction: 'move everything to 2026-10-06' }
			}
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true, applied: 1 });
		const [row] = await testDb()
			.select({ title: events.title, start: events.start, end: events.end, location: events.location })
			.from(events)
			.where(eq(events.id, 'evtoneoff01'));
		expect(row?.title).toBe('Soccer practice');
		expect(new Date(String(row?.start)).toISOString()).toBe('2026-10-06T09:00:00.000Z');
		expect(new Date(String(row?.end)).toISOString()).toBe('2026-10-06T10:00:00.000Z');
	});

	it("answers 422 when the instruction matches nothing and when a posted plan names no editable id", async () => {
		const user = await seedOwnedEvent();

		const nothing = await invoke(bulkEdit, {
			ctx: ctx(),
			user,
			path: '/api/events/bulk',
			body: {
				ids: [{ id: 'evtoneoff01' }],
				op: { type: 'smart', instruction: 'hello there' }
			}
		});
		expect(nothing.status).toBe(422);
		expect(nothing.body).toEqual({
			error: 'Could not match that instruction. Try naming a date or the events.'
		});

		const foreignPlan = await invoke(bulkEdit, {
			ctx: ctx(),
			user,
			path: '/api/events/bulk',
			body: {
				ids: [{ id: 'evtoneoff01' }],
				op: { type: 'smart', instruction: 'reviewed plan' },
				plan: [{ id: 'somebodyelse1', date: '2026-10-06' }]
			}
		});
		expect(foreignPlan.status).toBe(422);
		expect(foreignPlan.body).toEqual({ error: 'No valid changes in plan' });
	});

	it("counts only what really applied: an uneditable match fails per item", async () => {
		const owner = await seedUser(testDb(), { firstName: 'Mia' });
		const partner = await seedUser(testDb(), { firstName: 'Sam' });
		await testDb().insert(families).values({ id: FAMILY, name: 'Riveras' });
		await seedMembership(FAMILY, owner.id);
		await seedMembership(FAMILY, partner.id);
		await seedCalendarRow(FAMILY_CAL, { familyId: FAMILY });
		await seedEventRow({
			id: 'evtoneoff01',
			ownerId: owner.id,
			calendarId: FAMILY_CAL,
			title: 'Family dinner',
			start: '2026-10-09T18:00:00.000Z'
		});

		const res = await invoke(bulkEdit, {
			ctx: ctx(),
			user: partner,
			path: '/api/events/bulk',
			body: { ids: [{ id: 'evtoneoff01' }], op: { type: 'delete' } }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			success: true,
			applied: 0,
			failed: [{ id: 'evtoneoff01', error: 'not found' }]
		});
		expect(await testDb().select({ id: events.id }).from(events)).toHaveLength(1);
	});

	// Access gap pinned as today: the attendants op writes attendance rows for
	// every id in the READ scope — it never goes through the #165 owner leg
	// (`bulk/+server.ts:146-182`), so a family member can add guests to another
	// member's Event.
	it("lets any reader merge attendants into another member's event (no owner leg on attendants)", async () => {
		const owner = await seedUser(testDb(), { firstName: 'Mia' });
		const partner = await seedUser(testDb(), { firstName: 'Sam' });
		await testDb().insert(families).values({ id: FAMILY, name: 'Riveras' });
		await seedMembership(FAMILY, owner.id);
		await seedMembership(FAMILY, partner.id);
		await seedCalendarRow(FAMILY_CAL, { familyId: FAMILY });
		await seedEventRow({
			id: 'evtoneoff01',
			ownerId: owner.id,
			calendarId: FAMILY_CAL,
			title: 'Family dinner',
			start: '2026-10-09T18:00:00.000Z'
		});

		const res = await invoke(bulkEdit, {
			ctx: ctx(),
			user: partner,
			path: '/api/events/bulk',
			body: {
				ids: [{ id: 'evtoneoff01' }],
				op: { type: 'attendants', add: ['Grandma'] }
			}
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true, applied: 1, failed: [] });
		const guests = await testDb()
			.select({ name: eventAttendance.name, status: eventAttendance.status })
			.from(eventAttendance)
			.where(eq(eventAttendance.eventId, 'evtoneoff01'));
		expect(guests).toEqual([{ name: 'Grandma', status: 'undecided' }]);
	});

	// Access gap pinned as today: `applyBulkPlan` counts a `delete` op as applied
	// without looking at what the scoped delete returned
	// (`bulkApplyService.ts:81-84`), so a plan the owner leg refuses still
	// reports `applied: 1` while the row survives.
	it('counts a smart plan delete as applied even when nothing was deleted', async () => {
		const owner = await seedUser(testDb(), { firstName: 'Mia' });
		const partner = await seedUser(testDb(), { firstName: 'Sam' });
		await testDb().insert(families).values({ id: FAMILY, name: 'Riveras' });
		await seedMembership(FAMILY, owner.id);
		await seedMembership(FAMILY, partner.id);
		await seedCalendarRow(FAMILY_CAL, { familyId: FAMILY });
		await seedEventRow({
			id: 'evtoneoff01',
			ownerId: owner.id,
			calendarId: FAMILY_CAL,
			title: 'Family dinner',
			start: '2026-10-09T18:00:00.000Z'
		});

		const res = await invoke(bulkEdit, {
			ctx: ctx(),
			user: partner,
			path: '/api/events/bulk',
			body: {
				ids: [{ id: 'evtoneoff01' }],
				op: { type: 'smart', instruction: 'reviewed plan' },
				plan: [{ id: 'evtoneoff01', delete: true }]
			}
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true, applied: 1 });
		expect(await testDb().select({ id: events.id }).from(events)).toHaveLength(1);
	});

	it('refuses a body without ids and op, without valid ids, or with no editable match', async () => {
		const user = await seedOwnedEvent();

		const noOp = await invoke(bulkEdit, {
			ctx: ctx(),
			user,
			path: '/api/events/bulk',
			body: { ids: [{ id: 'evtoneoff01' }] }
		});
		expect(noOp.status).toBe(400);
		expect(noOp.body).toEqual({ error: 'ids and op are required' });

		const noIds = await invoke(bulkEdit, {
			ctx: ctx(),
			user,
			path: '/api/events/bulk',
			body: { ids: [{ id: 'x' }], op: { type: 'delete' } }
		});
		expect(noIds.status).toBe(400);
		expect(noIds.body).toEqual({ error: 'No valid event ids' });

		const noneEditable = await invoke(bulkEdit, {
			ctx: ctx(),
			user,
			path: '/api/events/bulk',
			body: { ids: [{ id: 'missingevent1' }], op: { type: 'delete' } }
		});
		expect(noneEditable.status).toBe(403);
		expect(noneEditable.body).toEqual({ error: 'No editable events matched' });

		const noInstruction = await invoke(bulkEdit, {
			ctx: ctx(),
			user,
			path: '/api/events/bulk',
			body: { ids: [{ id: 'evtoneoff01' }], op: { type: 'smart' } }
		});
		expect(noInstruction.status).toBe(400);
		expect(noInstruction.body).toEqual({ error: 'instruction required' });

		const unknownOp = await invoke(bulkEdit, {
			ctx: ctx(),
			user,
			path: '/api/events/bulk',
			body: { ids: [{ id: 'evtoneoff01' }], op: { type: 'frobnicate' } }
		});
		expect(unknownOp.status).toBe(400);
		expect(unknownOp.body).toEqual({ error: 'Unknown op type' });
	});
});

describe('GET /api/calendars', () => {
	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const res = await invoke(listCalendars, { ctx: ctx() });

		expect(res.status).toBe(401);
		expect(res.body).toEqual({ error: 'Unauthorized' });
	});

	it('lists the personal calendar first with the default colour when there is no family', async () => {
		const user = await seedUser(testDb());
		await seedCalendarRow(PERSONAL_CAL, { ownerId: user.id });

		const res = await invoke(listCalendars, { ctx: ctx(), user });

		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			calendars: [
				{ id: PERSONAL_CAL, name: 'Personal Calendar', color: '#fa8072', kind: 'personal' }
			]
		});
	});

	it('adds the family calendar with the settings colour and the family name', async () => {
		const user = await seedUser(testDb());
		await testDb().insert(families).values({ id: FAMILY, name: 'Riveras', color: '#00ff00' });
		await seedMembership(FAMILY, user.id);
		await seedCalendarRow(PERSONAL_CAL, { ownerId: user.id });
		await seedCalendarRow(FAMILY_CAL, { familyId: FAMILY });
		await testDb().insert(userSettings).values({ userId: user.id, color: '#123456' });

		const res = await invoke(listCalendars, { ctx: ctx(), user });

		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			calendars: [
				{ id: PERSONAL_CAL, name: 'Personal Calendar', color: '#123456', kind: 'personal' },
				{ id: FAMILY_CAL, name: 'Riveras', color: '#00ff00', kind: 'family' }
			]
		});
	});

	it('falls back to the default colours when nothing is set, and stays personal-only without a family calendar', async () => {
		const user = await seedUser(testDb());
		await testDb().insert(families).values({ id: FAMILY, name: 'Riveras', color: null });
		await seedMembership(FAMILY, user.id);
		await seedCalendarRow(PERSONAL_CAL, { ownerId: user.id });

		const noFamilyCal = await invoke(listCalendars, { ctx: ctx(), user });
		expect(noFamilyCal.body).toEqual({
			calendars: [{ id: PERSONAL_CAL, name: 'Personal Calendar', color: '#fa8072', kind: 'personal' }]
		});

		await seedCalendarRow(FAMILY_CAL, { familyId: FAMILY });
		const withFamilyCal = await invoke(listCalendars, { ctx: ctx(), user });
		expect(withFamilyCal.body).toEqual({
			calendars: [
				{ id: PERSONAL_CAL, name: 'Personal Calendar', color: '#fa8072', kind: 'personal' },
				{ id: FAMILY_CAL, name: 'Riveras', color: '#e0ffff', kind: 'family' }
			]
		});
	});

	it('creates the personal calendar when the viewer has none yet', async () => {
		const user = await seedUser(testDb());

		const res = await invoke(listCalendars, { ctx: ctx(), user });

		expect(res.status).toBe(200);
		const [calendar] = arrayField(objectBody(res), 'calendars');
		expect(calendar).toEqual({
			id: expect.stringMatching(/^[a-z0-9]{15}$/),
			name: 'Personal Calendar',
			color: '#fa8072',
			kind: 'personal'
		});
		expect(await testDb().select({ id: calendars.id }).from(calendars)).toHaveLength(1);
	});
});

describe('GET /api/print', () => {
	async function seedViewer(overrides: { weekStart?: string } = {}) {
		const user = await seedUser(testDb());
		await seedCalendarRow(PERSONAL_CAL, { ownerId: user.id });
		if (overrides.weekStart) {
			await testDb().insert(userSettings).values({ userId: user.id, ...overrides });
		}
		return user;
	}

	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const res = await invoke(printMonth, { ctx: ctx() });

		expect(res.status).toBe(401);
		expect(res.body).toEqual({ error: 'Unauthorized' });
	});

	it('lays the requested month out as a Sunday-first grid by default', async () => {
		const user = await seedViewer();

		const res = await invoke(printMonth, {
			ctx: ctx(),
			user,
			query: { year: '2026', month: '2' }
		});

		expect(res.status).toBe(200);
		const body = objectBody(res);
		expect(body).toMatchObject({
			year: 2026,
			month: 2,
			monthName: 'February',
			weekStart: 'sunday',
			familyName: null,
			prev: { year: 2026, month: 1 },
			next: { year: 2026, month: 3 },
			// the real clock decides "this month"; whether it is February is not the wire.
			isCurrentMonth: expect.any(Boolean)
		});
		const grid = arrayField(body, 'grid');
		expect(grid).toHaveLength(28);
		expect(grid[0]).toEqual({
			day: 1,
			iso: '2026-02-01',
			inMonth: true,
			isToday: expect.any(Boolean),
			items: []
		});
		expect(grid[27]).toEqual({
			day: 28,
			iso: '2026-02-28',
			inMonth: true,
			isToday: expect.any(Boolean),
			items: []
		});
	});

	it('pads the month to whole Monday-first weeks from the weekStart setting, with the family name', async () => {
		const user = await seedViewer({ weekStart: 'monday' });
		await testDb().insert(families).values({ id: FAMILY, name: 'Riveras' });
		await seedMembership(FAMILY, user.id);

		const res = await invoke(printMonth, {
			ctx: ctx(),
			user,
			query: { year: '2026', month: '2' }
		});

		expect(res.status).toBe(200);
		const body = objectBody(res);
		expect(body).toMatchObject({ weekStart: 'monday', familyName: 'Riveras', monthName: 'February' });
		const grid = arrayField(body, 'grid');
		// Feb 1 2026 is a Sunday, so six leading cells finish the first week.
		expect(grid).toHaveLength(35);
		expect(grid[0]).toMatchObject({ day: 26, iso: '2026-01-26', inMonth: false });
		expect(grid[6]).toMatchObject({ day: 1, iso: '2026-02-01', inMonth: true });
		expect(grid[34]).toMatchObject({ day: 1, iso: '2026-03-01', inMonth: false });
	});

	it('clamps a month outside 1-12 into the last month of the year', async () => {
		const user = await seedViewer();

		const res = await invoke(printMonth, {
			ctx: ctx(),
			user,
			query: { year: '2026', month: '13' }
		});

		expect(res.status).toBe(200);
		expect(objectBody(res)).toMatchObject({
			year: 2026,
			month: 12,
			monthName: 'December',
			prev: { year: 2026, month: 11 },
			next: { year: 2027, month: 1 }
		});
	});

	// The sheet's ITEMS, in the current month so the expansion window can never
	// age them out. The grid's length depends on which month "now" is, so the
	// cells that carry items are pinned whole and every other cell is empty.
	const now = new Date();
	const PRINT_YEAR = now.getUTCFullYear();
	const PRINT_MONTH = now.getUTCMonth() + 1;
	const monthIso = (day: number, hour = 0, minute = 0) =>
		new Date(Date.UTC(PRINT_YEAR, PRINT_MONTH - 1, day, hour, minute)).toISOString();
	const monthDayIso = (day: number) => monthIso(day).slice(0, 10);

	it('writes each item with its colour, all-day flag and 9a / 2:30p time', async () => {
		const user = await seedUser(testDb());
		await testDb()
			.insert(userSettings)
			.values({ userId: user.id, timeZone: 'utc', color: '#123456' });
		await seedCalendarRow(PERSONAL_CAL, { ownerId: user.id });
		await testDb().insert(families).values({ id: FAMILY, name: 'Riveras', color: '#00ff00' });
		await seedMembership(FAMILY, user.id);
		await seedCalendarRow(FAMILY_CAL, { familyId: FAMILY });
		await seedEventRow({
			id: 'evtprint001',
			ownerId: user.id,
			calendarId: PERSONAL_CAL,
			title: 'Dentist',
			start: monthIso(1, 9),
			end: monthIso(1, 10)
		});
		await seedEventRow({
			id: 'evtprint002',
			ownerId: user.id,
			calendarId: PERSONAL_CAL,
			title: 'Piano',
			start: monthIso(3, 14, 30),
			end: monthIso(3, 15, 30)
		});
		await seedEventRow({
			id: 'evtprint003',
			ownerId: user.id,
			calendarId: PERSONAL_CAL,
			title: 'Camping',
			start: monthIso(5),
			end: new Date(Date.UTC(PRINT_YEAR, PRINT_MONTH - 1, 5, 23, 59, 59, 999)).toISOString(),
			allDay: true
		});
		await seedEventRow({
			id: 'evtprint004',
			ownerId: user.id,
			calendarId: FAMILY_CAL,
			title: 'Family dinner',
			start: monthIso(1, 10),
			end: monthIso(1, 11)
		});

		const res = await invoke(printMonth, {
			ctx: ctx(),
			user,
			query: { year: String(PRINT_YEAR), month: String(PRINT_MONTH) }
		});

		expect(res.status).toBe(200);
		const body = objectBody(res);
		expect(body.monthName).toBe(
			[
				'January',
				'February',
				'March',
				'April',
				'May',
				'June',
				'July',
				'August',
				'September',
				'October',
				'November',
				'December'
			][PRINT_MONTH - 1]
		);
		expect(body).toMatchObject({
			year: PRINT_YEAR,
			month: PRINT_MONTH,
			weekStart: 'sunday',
			familyName: 'Riveras',
			isCurrentMonth: true
		});

		const cells = arrayField(body, 'grid').map((cell) => objectValue(cell, 'cell'));
		const withItems = cells.filter((cell) => arrayField(cell, 'items').length > 0);
		expect(withItems).toEqual([
			{
				day: 1,
				iso: monthDayIso(1),
				inMonth: true,
				isToday: expect.any(Boolean),
				items: [
					{ title: 'Dentist', color: '#123456', allDay: false, time: '9a' },
					{ title: 'Family dinner', color: '#00ff00', allDay: false, time: '10a' }
				]
			},
			{
				day: 3,
				iso: monthDayIso(3),
				inMonth: true,
				isToday: expect.any(Boolean),
				items: [{ title: 'Piano', color: '#123456', allDay: false, time: '2:30p' }]
			},
			{
				day: 5,
				iso: monthDayIso(5),
				inMonth: true,
				isToday: expect.any(Boolean),
				items: [{ title: 'Camping', color: '#123456', allDay: true, time: null }]
			}
		]);
		// Exactly one cell is "today", and it is the viewer-zone date.
		expect(cells.filter((cell) => cell['isToday'] === true)).toHaveLength(1);
	});

	// Q-049 (flip-ready): the sheet expands through the legacy ±2-year window, so
	// the 500-occurrence cap fills months before the printed one and a daily
	// series vanishes from a month it occurs in every day. Seeded from
	// `new Date() - 800d`, the cap always fills ~230 days before today.
	it('drops a long-running series from the printed month once the 500 cap fills (Q-049)', async () => {
		const user = await seedUser(testDb());
		await seedCalendarRow(PERSONAL_CAL, { ownerId: user.id });
		const seriesStart = new Date(Date.now() - 800 * 86_400_000).toISOString();
		await seedEventRow({
			id: 'evtcap00001',
			ownerId: user.id,
			calendarId: PERSONAL_CAL,
			title: 'Morning run',
			start: seriesStart,
			end: new Date(Date.parse(seriesStart) + 3_600_000).toISOString(),
			recurrenceFrequency: 'daily',
			recurrenceInterval: 1
		});

		const res = await invoke(printMonth, {
			ctx: ctx(),
			user,
			query: { year: String(PRINT_YEAR), month: String(PRINT_MONTH) }
		});

		expect(res.status).toBe(200);
		const body = objectBody(res);
		expect(body).toMatchObject({ year: PRINT_YEAR, month: PRINT_MONTH, isCurrentMonth: true });
		const cells = arrayField(body, 'grid').map((cell) => objectValue(cell, 'cell'));
		expect(cells.filter((cell) => arrayField(cell, 'items').length > 0)).toEqual([]);
	});

	// `?month=0` is falsy, so it reads as "the current month" rather than
	// clamping into January.
	it('reads month=0 as the current month', async () => {
		const user = await seedViewer();

		const res = await invoke(printMonth, {
			ctx: ctx(),
			user,
			query: { year: String(PRINT_YEAR), month: '0' }
		});

		expect(res.status).toBe(200);
		expect(objectBody(res)).toMatchObject({
			year: PRINT_YEAR,
			month: PRINT_MONTH,
			isCurrentMonth: true
		});
	});
});

describe('GET /api/location-search', () => {
	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const res = await invoke(searchLocations, {
			ctx: ctx(),
			headers: { 'x-real-ip': '10.3.0.0' },
			query: { q: 'park' }
		});

		expect(res.status).toBe(401);
		expect(res.body).toEqual({ error: 'Unauthorized' });
	});

	// The upstream call is scripted, not skipped: S6 wires the `http` port with
	// the real fetch-wrapping adapter in goldens, so stubbing global `fetch`
	// keeps steering Nominatim while the URL and User-Agent stay pinned here.
	it('maps the upstream results onto {label, lat, lon} and calls Nominatim as documented', async () => {
		const user = await seedUser(testDb());
		const upstream = vi.fn(
			async (_url: string, _init: RequestInit) =>
				new Response(JSON.stringify([{ display_name: 'Park Avenue', lat: '40.7', lon: '-73.9' }]), {
					status: 200,
					headers: { 'content-type': 'application/json' }
				})
		);
		vi.stubGlobal('fetch', upstream);

		const res = await invoke(searchLocations, {
			ctx: ctx(),
			user,
			headers: { 'x-real-ip': '10.3.0.1' },
			query: { q: 'park ave' }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ results: [{ label: 'Park Avenue', lat: '40.7', lon: '-73.9' }] });
		const [calledUrl, init] = upstream.mock.calls[0] ?? [];
		expect(calledUrl).toBe(
			'https://nominatim.openstreetmap.org/search?format=json&addressdetails=0&limit=5&q=park%20ave'
		);
		expect(init?.headers).toEqual({
			'User-Agent': 'FamilyPlanz/1.0 (test@familyplanz.com)'
		});
	});

	it('answers an empty list when the upstream search fails', async () => {
		const user = await seedUser(testDb());
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new Error('upstream down');
			})
		);

		const res = await invoke(searchLocations, {
			ctx: ctx(),
			user,
			headers: { 'x-real-ip': '10.3.0.2' },
			query: { q: 'park' }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ results: [] });
	});

	it('answers an empty list when the upstream answers non-ok', async () => {
		const user = await seedUser(testDb());
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('upstream busy', { status: 503 }))
		);

		const res = await invoke(searchLocations, {
			ctx: ctx(),
			user,
			headers: { 'x-real-ip': '10.3.0.6' },
			query: { q: 'park' }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ results: [] });
	});
		const user = await seedUser(testDb());
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new Error('upstream down');
			})
		);

		const res = await invoke(searchLocations, {
			ctx: ctx(),
			user,
			headers: { 'x-real-ip': '10.3.0.2' },
			query: { q: 'park' }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ results: [] });
	});

	it('requires 2-100 characters of query', async () => {
		const user = await seedUser(testDb());

		const tooShort = await invoke(searchLocations, {
			ctx: ctx(),
			user,
			headers: { 'x-real-ip': '10.3.0.3' },
			query: { q: 'p' }
		});
		expect(tooShort.status).toBe(400);
		expect(tooShort.body).toEqual({ error: 'q is required and must be 2-100 characters' });

		const tooLong = await invoke(searchLocations, {
			ctx: ctx(),
			user,
			headers: { 'x-real-ip': '10.3.0.4' },
			query: { q: 'x'.repeat(101) }
		});
		expect(tooLong.status).toBe(400);
		expect(tooLong.body).toEqual({ error: 'q is required and must be 2-100 characters' });
	});

	it('rate limits a client after 60 searches a minute', async () => {
		const user = await seedUser(testDb());
		// ONE ctx for the whole burst: after the port the limiter comes from
		// testCtx, and a fresh ctx per request would reset its window.
		const context = ctx();
		const ip = '10.3.0.5';
		for (let attempt = 0; attempt < 60; attempt += 1) {
			// An invalid query keeps every allowed attempt off the network; the
			// limiter is consulted first either way.
			const allowed = await invoke(searchLocations, {
				ctx: context,
				user,
				headers: { 'x-real-ip': ip },
				query: { q: '' }
			});
			expect(allowed.status).toBe(400);
		}

		const limited = await invoke(searchLocations, {
			ctx: context,
			user,
			headers: { 'x-real-ip': ip },
			query: { q: 'park' }
		});
		expect(limited.status).toBe(429);
		expect(limited.body).toEqual({ error: 'Too many searches. Try again shortly.' });
	});
});
