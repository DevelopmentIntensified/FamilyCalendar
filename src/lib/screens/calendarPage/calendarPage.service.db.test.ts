/**
 * calendarPage service against real Postgres: the one composition — the
 * bounded month window, the calendar list (Personal Calendar first), the
 * roster, the due Tasks that ride their Event's calendar, the Sponsored Events
 * gate and the degrade-to-fallback contract.
 *
 * Expected values come from the legacy loader (`+page.server.ts:31-298`) and
 * the frozen shapes the domain services already pin. The screen owns no table,
 * so every row is seeded through kernel `seedUser` and the owning modules'
 * fixtures; the clock is pinned.
 *
 * Doc: ./README.md#sections-degrade-and-what-the-page-reads
 */
import { describe, expect } from 'vitest';
import { actorFromUser } from '$lib/kernel/ctx/actor';
import type { Db } from '$lib/kernel/db/database.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { seedFamily, seedMembership } from '$lib/domains/family/family.fixtures.server';
import { seedCalendarRow, seedEventRow } from '$lib/domains/calendar/calendar.fixtures.server';
import { seedTask } from '$lib/domains/tasks/tasks.fixtures.server';
import type { CalendarPageSeeds, CalendarPageSettings } from './calendarPage.contract';
import { getCalendarPage } from './calendarPage.service.server';

const NOW = '2026-01-15T09:00:00.000Z';
const FAMILY = 'fam-calpage01';
const PERSONAL_CAL = 'cal-calpage-personal';
const FAMILY_CAL = 'cal-calpage-family';

function viewerCtx(db: Db) {
	return testCtx({ db, now: NOW });
}

/** The settings facts a group entry hands the page (identity defaults). */
function settingsModel(overrides: Partial<CalendarPageSettings> = {}): CalendarPageSettings {
	return {
		weekStart: 'sunday',
		defaultView: 'monthView',
		timeZone: 'UTC',
		color: null,
		showAdsAsEvents: false,
		defaultCalendarId: null,
		...overrides
	};
}

/**
 * The seeds the URL rules resolve. March 2026 starts on a Sunday, so its
 * Sunday-start matrix is exactly 2026-03-01 .. 2026-04-04; the ranged read pads
 * a week either side on purpose, and the screen must drop that padding.
 */
function seedsOf(overrides: Partial<CalendarPageSeeds> = {}): CalendarPageSeeds {
	return { date: '2026-03-10', view: 'month', edit: null, create: null, ...overrides };
}

describe('getCalendarPage — the bounded month window', () => {
	rollbackTest('reads only the visible month grid window', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedUser(db);
		const actor = actorFromUser(user, 'session');
		await seedCalendarRow(PERSONAL_CAL, { ownerId: user.id }, db);
		await seedEventRow(
			{
				calendarId: PERSONAL_CAL,
				ownerId: user.id,
				title: 'Piano',
				start: '2026-03-10T10:00:00.000Z',
				end: '2026-03-10T11:00:00.000Z'
			},
			db
		);
		// Outside the matrix (2026-03-01 .. 2026-04-04) but inside the ranged
		// read's own week of padding: it is another month's row.
		await seedEventRow(
			{
				calendarId: PERSONAL_CAL,
				ownerId: user.id,
				title: 'April trip',
				start: '2026-04-10T10:00:00.000Z',
				end: '2026-04-10T11:00:00.000Z'
			},
			db
		);

		const model = await getCalendarPage(ctx, actor, {
			settings: settingsModel(),
			roster: [],
			seeds: seedsOf()
		});
		const grid = await model.grid;

		expect(model.shell.today).toBe('2026-01-15');
		expect(model.shell.zone).toBe('UTC');
		expect(grid.events.map((event) => event.title)).toEqual(['Piano']);
		expect(grid.warnings).toEqual([]);
		expect(model.shell.warnings).toEqual([]);
	});

	rollbackTest('lists the Personal Calendar first, even when it had to be provisioned', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedUser(db);
		const actor = actorFromUser(user, 'session');

		const model = await getCalendarPage(ctx, actor, {
			settings: settingsModel(),
			roster: [],
			seeds: seedsOf()
		});
		await model.grid;

		expect(model.shell.calendars.length).toBe(1);
		expect(model.shell.calendars[0]).toMatchObject({
			name: 'Personal Calendar',
			color: '#fa8072',
			kind: 'personal'
		});
	});

	rollbackTest('adds the family calendar after the personal one', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedUser(db);
		const actor = actorFromUser(user, 'session');
		await seedFamily(FAMILY, { name: 'Riveras', color: '#00ff00' }, db);
		await seedMembership(FAMILY, user.id, 'member', 'member', db);
		await seedCalendarRow(PERSONAL_CAL, { ownerId: user.id }, db);
		await seedCalendarRow(FAMILY_CAL, { familyId: FAMILY }, db);

		const model = await getCalendarPage(ctx, actor, {
			settings: settingsModel(),
			roster: [],
			seeds: seedsOf()
		});
		await model.grid;

		expect(model.shell.calendars.map((calendar) => calendar.kind)).toEqual([
			'personal',
			'family'
		]);
		expect(model.shell.calendars[1]).toEqual({
			id: FAMILY_CAL,
			name: 'Riveras',
			color: '#00ff00',
			kind: 'family'
		});
	});
});

describe('getCalendarPage — due Tasks', () => {
	rollbackTest('keeps due, undone Tasks inside the window and rides their calendar', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedUser(db);
		const actor = actorFromUser(user, 'session');
		await seedCalendarRow(PERSONAL_CAL, { ownerId: user.id }, db);
		await seedTask(db, {
			userId: user.id,
			title: 'Slip back',
			dueDate: '2026-03-10 09:00:00+00',
			recurrenceFrequency: 'weekly',
			recurrenceInterval: 2
		});
		await seedTask(db, {
			userId: user.id,
			title: 'Done already',
			dueDate: '2026-03-11 09:00:00+00',
			completedAt: '2026-03-11 10:00:00+00'
		});
		await seedTask(db, {
			userId: user.id,
			title: 'May task',
			dueDate: '2026-05-02 09:00:00+00'
		});

		const model = await getCalendarPage(ctx, actor, {
			settings: settingsModel(),
			roster: [],
			seeds: seedsOf()
		});
		const grid = await model.grid;

		expect(grid.tasks.map((task) => task.title)).toEqual(['Slip back']);
		// A Task with no parent Event rides the viewer's Personal Calendar.
		expect(grid.tasks[0]?.calendarId).toBe(PERSONAL_CAL);
		expect(grid.tasks[0]?.recurrenceFrequency).toBe('weekly');
	});
});

describe('getCalendarPage — Sponsored Events', () => {
	rollbackTest('serves no Sponsored Events when the gate is off', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedUser(db);
		const actor = actorFromUser(user, 'session');

		const model = await getCalendarPage(ctx, actor, {
			settings: settingsModel({ showAdsAsEvents: false }),
			roster: [],
			seeds: seedsOf()
		});
		const grid = await model.grid;

		expect(grid.ads).toEqual([]);
		expect(grid.warnings).toEqual([]);
	});

	rollbackTest('a failing ads leg degrades to its fallback and names itself', async (db) => {
		// No identity ports on this ctx: the ads read cannot be composed, which
		// is the legacy `guard('ads', …)` path — one label, no 500.
		const ctx = viewerCtx(db);
		const user = await seedUser(db);
		const actor = actorFromUser(user, 'session');

		const model = await getCalendarPage(ctx, actor, {
			settings: settingsModel({ showAdsAsEvents: true }),
			roster: [],
			seeds: seedsOf()
		});
		const grid = await model.grid;

		expect(grid.ads).toEqual([]);
		expect(grid.warnings).toEqual(['ads']);
		expect(model.shell.warnings).toEqual([]);
	});
});

describe('getCalendarPage — the shell', () => {
	rollbackTest('keeps first and last names on the roster', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedUser(db);
		const actor = actorFromUser(user, 'session');

		const model = await getCalendarPage(ctx, actor, {
			settings: settingsModel(),
			roster: [{ userId: user.id, firstName: 'Mia', lastName: 'Rivera' }],
			seeds: seedsOf()
		});
		await model.grid;

		expect(model.shell.roster).toEqual([
			{ userId: user.id, firstName: 'Mia', lastName: 'Rivera' }
		]);
	});

	rollbackTest('carries the resolved seeds and the viewer facts', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedUser(db);
		const actor = actorFromUser(user, 'session');

		const model = await getCalendarPage(ctx, actor, {
			settings: settingsModel({ weekStart: 'monday' }),
			roster: [],
			seeds: seedsOf({ edit: 'evt-1', create: { quickAdd: 'Lunch Friday', note: 'note' } })
		});
		await model.grid;

		expect(model.shell.viewerId).toBe(user.id);
		expect(model.shell.weekStart).toBe('monday');
		expect(model.shell.seeds).toEqual({
			date: '2026-03-10',
			view: 'month',
			edit: 'evt-1',
			create: { quickAdd: 'Lunch Friday', note: 'note' }
		});
	});
});
