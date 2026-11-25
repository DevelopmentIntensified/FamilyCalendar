/**
 * calendar calendars services against real Postgres: the viewer's calendar
 * list, the printable month, the nudge audience and the two cross-module port
 * adapters.
 *
 * Expected values come from `calendarData.ts`, `printData.ts` and the frozen
 * `calendar.bulk.http.db.test.ts` (calendars, print). The clock is pinned by
 * `testCtx({ now })`, so the print month and its "today" are deterministic.
 *
 * Doc: ./README.md#how-to-test
 */
import { describe, expect } from 'vitest';
import { actorFromUser } from '$lib/kernel/ctx/actor';
import type { Db } from '$lib/kernel/db/database.server';
import { calendars, userSettings } from '$lib/kernel/db/tables.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { seedFamily, seedMembership } from '$lib/domains/family/family.fixtures.server';
import { seedCalendarRow, seedEventRow } from './calendar.fixtures.server';
import {
	createCalendarAccessPort,
	createFamilyCalendarPort,
	getPrintMonth,
	listCalendarChoices,
	listCalendars
} from './calendar.calendars.service.server';

const NOW = '2026-01-15T09:00:00.000Z';
const PERSONAL_CAL = 'cal-personal01';
const FAMILY_CAL = 'cal-family01';
const FAMILY = 'fam-riveras01';

function viewerCtx(db: Db) {
	return testCtx({ db, now: NOW });
}

describe('listCalendars', () => {
	rollbackTest('lists the personal calendar first with the legacy salmon when nothing is stored', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedUser(db);
		await seedCalendarRow(PERSONAL_CAL, { ownerId: user.id }, db);

		const result = await listCalendars(ctx, actorFromUser(user, 'session'));

		// Calendar's own palette, NOT identity's #3b82f6 for a settings-less row.
		expect(result.calendars).toEqual([
			{ id: PERSONAL_CAL, name: 'Personal Calendar', color: '#fa8072', kind: 'personal' }
		]);
	});

	rollbackTest('uses the stored colour and the family name and colour', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedUser(db);
		await seedFamily(FAMILY, { name: 'Riveras', color: '#00ff00' }, db);
		await seedMembership(FAMILY, user.id, 'member', 'member', db);
		await seedCalendarRow(PERSONAL_CAL, { ownerId: user.id }, db);
		await seedCalendarRow(FAMILY_CAL, { familyId: FAMILY }, db);
		await db.insert(userSettings).values({ userId: user.id, color: '#123456' });

		const result = await listCalendars(ctx, actorFromUser(user, 'session'));

		expect(result.calendars).toEqual([
			{ id: PERSONAL_CAL, name: 'Personal Calendar', color: '#123456', kind: 'personal' },
			{ id: FAMILY_CAL, name: 'Riveras', color: '#00ff00', kind: 'family' }
		]);
	});

	rollbackTest('answers only the personal calendar when the family has no calendar row', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedUser(db);
		await seedFamily(FAMILY, { name: 'Riveras', color: null }, db);
		await seedMembership(FAMILY, user.id, 'member', 'member', db);
		await seedCalendarRow(PERSONAL_CAL, { ownerId: user.id }, db);

		const result = await listCalendars(ctx, actorFromUser(user, 'session'));

		expect(result.calendars).toEqual([
			{ id: PERSONAL_CAL, name: 'Personal Calendar', color: '#fa8072', kind: 'personal' }
		]);
	});

	rollbackTest('falls back to the family palette when the family colour is unset', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedUser(db);
		await seedFamily(FAMILY, { name: 'Riveras', color: null }, db);
		await seedMembership(FAMILY, user.id, 'member', 'member', db);
		await seedCalendarRow(FAMILY_CAL, { familyId: FAMILY }, db);

		const result = await listCalendars(ctx, actorFromUser(user, 'session'));

		expect(result.calendars).toEqual([
			{
				id: expect.stringMatching(/^[a-z0-9]{15}$/),
				name: 'Personal Calendar',
				color: '#fa8072',
				kind: 'personal'
			},
			{ id: FAMILY_CAL, name: 'Riveras', color: '#e0ffff', kind: 'family' }
		]);
	});

	rollbackTest('creates the personal calendar when the viewer has none yet', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedUser(db);

		const result = await listCalendars(ctx, actorFromUser(user, 'session'));

		const [calendar] = result.calendars;
		expect(calendar).toEqual({
			id: expect.stringMatching(/^[a-z0-9]{15}$/),
			name: 'Personal Calendar',
			color: '#fa8072',
			kind: 'personal'
		});
		expect(await db.select({ id: calendars.id }).from(calendars)).toHaveLength(1);
	});
});

describe('listCalendarChoices (Q-082)', () => {
	rollbackTest('names every calendar the viewer can pick: each family by its own name, repeats numbered', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedUser(db);
		const other = await seedUser(db);
		await seedCalendarRow('cal-personal01', { ownerId: user.id }, db);
		await seedCalendarRow('cal-personal02', { ownerId: user.id }, db);
		await seedCalendarRow('cal-someoneelse', { ownerId: other.id }, db);
		await seedFamily('fam-a', { name: 'Riveras', createdAt: '2026-01-01T00:00:00.000Z' }, db);
		await seedFamily('fam-b', { name: 'Stones', createdAt: '2026-02-01T00:00:00.000Z' }, db);
		await seedFamily('fam-c', { name: 'Strangers', createdAt: '2026-03-01T00:00:00.000Z' }, db);
		await seedMembership('fam-a', user.id, 'member', 'member', db);
		await seedMembership('fam-b', user.id, 'member', 'member', db);
		await seedCalendarRow('cal-fam-a', { familyId: 'fam-a' }, db);
		await seedCalendarRow('cal-fam-b', { familyId: 'fam-b' }, db);
		await seedCalendarRow('cal-fam-c', { familyId: 'fam-c' }, db);

		const result = await listCalendarChoices(ctx, actorFromUser(user, 'session'));

		expect(result.calendars).toEqual([
			{ id: 'cal-personal01', name: 'Personal Calendar' },
			{ id: 'cal-personal02', name: 'Personal Calendar 2' },
			{ id: 'cal-fam-a', name: 'Riveras' },
			{ id: 'cal-fam-b', name: 'Stones' }
		]);
	});

	rollbackTest('creates the personal calendar when the viewer has none yet', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedUser(db);

		const result = await listCalendarChoices(ctx, actorFromUser(user, 'session'));

		expect(result.calendars).toEqual([
			{ id: expect.stringMatching(/^[a-z0-9]{15}$/), name: 'Personal Calendar' }
		]);
		expect(await db.select({ id: calendars.id }).from(calendars)).toHaveLength(1);
	});

	rollbackTest('labels a family with no name "Family Calendar"', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedUser(db);
		await seedCalendarRow('cal-personal01', { ownerId: user.id }, db);
		await seedFamily('fam-a', { name: '' }, db);
		await seedMembership('fam-a', user.id, 'member', 'member', db);
		await seedCalendarRow('cal-fam-a', { familyId: 'fam-a' }, db);

		const result = await listCalendarChoices(ctx, actorFromUser(user, 'session'));

		expect(result.calendars).toEqual([
			{ id: 'cal-personal01', name: 'Personal Calendar' },
			{ id: 'cal-fam-a', name: 'Family Calendar' }
		]);
	});
});

describe('getPrintMonth', () => {
	rollbackTest('lays the requested month out as a Sunday-first grid', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedUser(db);
		await seedCalendarRow(PERSONAL_CAL, { ownerId: user.id }, db);

		const month = await getPrintMonth(ctx, actorFromUser(user, 'session'), {
			year: '2026',
			month: '2'
		});

		expect(month).toMatchObject({
			year: 2026,
			month: 2,
			monthName: 'February',
			weekStart: 'sunday',
			familyName: null,
			prev: { year: 2026, month: 1 },
			next: { year: 2026, month: 3 },
			isCurrentMonth: false
		});
		expect(month.grid).toHaveLength(28);
		expect(month.grid[0]).toEqual({
			day: 1,
			iso: '2026-02-01',
			inMonth: true,
			isToday: false,
			items: []
		});
		expect(month.grid[27]).toEqual({
			day: 28,
			iso: '2026-02-28',
			inMonth: true,
			isToday: false,
			items: []
		});
	});

	rollbackTest('pads to whole Monday-first weeks from the setting, with the family name', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedUser(db);
		await seedCalendarRow(PERSONAL_CAL, { ownerId: user.id }, db);
		await seedFamily(FAMILY, { name: 'Riveras' }, db);
		await seedMembership(FAMILY, user.id, 'member', 'member', db);
		await db.insert(userSettings).values({ userId: user.id, weekStart: 'monday' });

		const month = await getPrintMonth(ctx, actorFromUser(user, 'session'), {
			year: '2026',
			month: '2'
		});

		expect(month).toMatchObject({ weekStart: 'monday', familyName: 'Riveras' });
		// Feb 1 2026 is a Sunday, so six leading cells finish the first week.
		expect(month.grid).toHaveLength(35);
		expect(month.grid[0]).toMatchObject({ day: 26, iso: '2026-01-26', inMonth: false });
		expect(month.grid[6]).toMatchObject({ day: 1, iso: '2026-02-01', inMonth: true });
		expect(month.grid[34]).toMatchObject({ day: 1, iso: '2026-03-01', inMonth: false });
	});

	rollbackTest('clamps a month outside 1-12 into the last month of the year', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedUser(db);
		await seedCalendarRow(PERSONAL_CAL, { ownerId: user.id }, db);

		const month = await getPrintMonth(ctx, actorFromUser(user, 'session'), {
			year: '2026',
			month: '13'
		});

		expect(month).toMatchObject({
			year: 2026,
			month: 12,
			monthName: 'December',
			prev: { year: 2026, month: 11 },
			next: { year: 2027, month: 1 }
		});
	});

	rollbackTest('reads month=0 as the current month', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedUser(db);
		await seedCalendarRow(PERSONAL_CAL, { ownerId: user.id }, db);

		const month = await getPrintMonth(ctx, actorFromUser(user, 'session'), {
			year: '2026',
			month: '0'
		});

		expect(month).toMatchObject({ year: 2026, month: 1, isCurrentMonth: true });
	});

	rollbackTest('writes each cell item with its colour, all-day flag and 9a / 2:30p time', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedUser(db);
		await db
			.insert(userSettings)
			.values({ userId: user.id, timeZone: 'utc', color: '#123456' });
		await seedCalendarRow(PERSONAL_CAL, { ownerId: user.id }, db);
		await seedFamily(FAMILY, { name: 'Riveras', color: '#00ff00' }, db);
		await seedMembership(FAMILY, user.id, 'member', 'member', db);
		await seedCalendarRow(FAMILY_CAL, { familyId: FAMILY }, db);
		await seedEventRow(
			{
				id: 'evtprint001',
				ownerId: user.id,
				calendarId: PERSONAL_CAL,
				title: 'Dentist',
				start: '2026-01-05T09:00:00.000Z',
				end: '2026-01-05T10:00:00.000Z'
			},
			db
		);
		await seedEventRow(
			{
				id: 'evtprint002',
				ownerId: user.id,
				calendarId: PERSONAL_CAL,
				title: 'Piano',
				start: '2026-01-07T14:30:00.000Z',
				end: '2026-01-07T15:30:00.000Z'
			},
			db
		);
		await seedEventRow(
			{
				id: 'evtprint003',
				ownerId: user.id,
				calendarId: PERSONAL_CAL,
				title: 'Camping',
				start: '2026-01-09T00:00:00.000Z',
				end: '2026-01-09T23:59:59.999Z',
				allDay: true
			},
			db
		);
		await seedEventRow(
			{
				id: 'evtprint004',
				ownerId: user.id,
				calendarId: FAMILY_CAL,
				title: 'Family dinner',
				start: '2026-01-05T10:00:00.000Z',
				end: '2026-01-05T11:00:00.000Z'
			},
			db
		);

		const month = await getPrintMonth(ctx, actorFromUser(user, 'session'), {
			year: '2026',
			month: '1'
		});

		const withItems = month.grid.filter((cell) => cell.items.length > 0);
		expect(withItems).toEqual([
			{
				day: 5,
				iso: '2026-01-05',
				inMonth: true,
				isToday: false,
				items: [
					{ title: 'Dentist', color: '#123456', allDay: false, time: '9a' },
					{ title: 'Family dinner', color: '#00ff00', allDay: false, time: '10a' }
				]
			},
			{
				day: 7,
				iso: '2026-01-07',
				inMonth: true,
				isToday: false,
				items: [{ title: 'Piano', color: '#123456', allDay: false, time: '2:30p' }]
			},
			{
				day: 9,
				iso: '2026-01-09',
				inMonth: true,
				isToday: false,
				items: [{ title: 'Camping', color: '#123456', allDay: true, time: null }]
			}
		]);
		expect(month.grid.filter((cell) => cell.isToday)).toHaveLength(1);
		expect(month.grid.find((cell) => cell.isToday)?.iso).toBe('2026-01-15');
	});

	rollbackTest('prints every day of a long-running daily series inside the month (Q-049)', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedUser(db);
		await seedCalendarRow(PERSONAL_CAL, { ownerId: user.id }, db);
		// 800 days before the pinned "today": under the old ±2-year window the
		// 500 daily emissions stopped ~230 days before January 2026 and the
		// month printed empty. The month window expands it in full.
		await seedEventRow(
			{
				id: 'evtcap00001',
				ownerId: user.id,
				calendarId: PERSONAL_CAL,
				title: 'Morning run',
				start: '2023-11-07T09:00:00.000Z',
				end: '2023-11-07T10:00:00.000Z',
				recurrenceFrequency: 'daily',
				recurrenceInterval: 1
			},
			db
		);

		const month = await getPrintMonth(ctx, actorFromUser(user, 'session'), {
			year: '2026',
			month: '1'
		});

		const inMonth = month.grid.filter((cell) => cell.inMonth);
		expect(inMonth).toHaveLength(31);
		for (const cell of inMonth) {
			expect(cell.items).toEqual([
				{ title: 'Morning run', color: '#fa8072', allDay: false, time: '9a' }
			]);
		}
	});

	rollbackTest('prints every occurrence of a weekly series inside the month', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedUser(db);
		await db.insert(userSettings).values({ userId: user.id, timeZone: 'utc' });
		await seedCalendarRow(PERSONAL_CAL, { ownerId: user.id }, db);
		await seedEventRow(
			{
				id: 'evtseries01',
				ownerId: user.id,
				calendarId: PERSONAL_CAL,
				title: 'Swim',
				start: '2026-01-05T09:00:00.000Z',
				end: '2026-01-05T10:00:00.000Z',
				recurrenceFrequency: 'weekly',
				recurrenceInterval: 1,
				recurrenceCount: 3
			},
			db
		);

		const month = await getPrintMonth(ctx, actorFromUser(user, 'session'), {
			year: '2026',
			month: '1'
		});

		// Weekly from Jan 5: Jan 5, 12 and 19 print at 9a.
		expect(
			month.grid
				.filter((cell) => cell.items.length > 0)
				.map((cell) => ({ iso: cell.iso, time: cell.items[0]?.time }))
		).toEqual([
			{ iso: '2026-01-05', time: '9a' },
			{ iso: '2026-01-12', time: '9a' },
			{ iso: '2026-01-19', time: '9a' }
		]);
	});
});

describe('port adapters', () => {
	rollbackTest('creates the family calendar row in the caller transaction', async (db) => {
		const ctx = viewerCtx(db);
		await seedFamily(FAMILY, { name: 'Riveras' }, db);

		await createFamilyCalendarPort().createFamilyCalendar(ctx, FAMILY);

		const [row] = await db.select().from(calendars);
		expect(row).toMatchObject({ familyId: FAMILY, ownerId: null });
	});

	rollbackTest('lists personal and every family calendar id for the access port', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedUser(db);
		await seedCalendarRow(PERSONAL_CAL, { ownerId: user.id }, db);
		await seedFamily(FAMILY, { name: 'Riveras' }, db);
		await seedMembership(FAMILY, user.id, 'member', 'member', db);
		await seedCalendarRow(FAMILY_CAL, { familyId: FAMILY }, db);

		const ids = await createCalendarAccessPort(ctx).listAccessibleCalendarIds(user.id);

		expect([...ids].sort()).toEqual([FAMILY_CAL, PERSONAL_CAL]);
	});
});
