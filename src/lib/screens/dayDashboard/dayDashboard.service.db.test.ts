/**
 * dayDashboard service against real Postgres: the ONE composition's legs, the
 * skip matrix, the viewed day in the viewer's zone and `isToday`. Each test
 * runs in `rollbackTest`; `goldenCtx` supplies the real cross-module ports, so
 * the visibility read sees identity's settings row exactly as production does.
 *
 * Expected values come from the legacy loader (`dashboardData.ts`) and the
 * frozen `/api/dashboard` golden (`dayDashboard.http.db.test.ts`), never from
 * running this code first.
 *
 * Doc: ./README.md#how-to-test
 */
import { describe, expect } from 'vitest';
import {
	calendars,
	dashboardModuleSwitches,
	eventAttendance,
	events,
	families,
	familyMembers,
	groceryItems,
	taskCategories,
	taskCompletions,
	tasks,
	userSettings
} from '$lib/kernel/db/tables.server';
import { goldenCtx } from '$lib/app/testing/goldenCtx.server';
import { actorFromUser } from '$lib/kernel/ctx/actor';
import type { Db } from '$lib/kernel/db/database.server';
import type { UserRow } from '$lib/kernel/db/tables.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { loadDayDashboard } from './dayDashboard.service.server';

/** The fixed clock every test in this file reads time from. */
const NOW = '2026-01-15T12:00:00.000Z';
const ctx = (db: Db, now = NOW) => goldenCtx({ db, now });

/** A family with two children, a viewed day of events, tasks and groceries. */
async function seedFamilyDay(db: Db): Promise<{ me: UserRow }> {
	const me = await seedUser(db, {
		id: 'user-me',
		firstName: 'Riley',
		lastName: 'Chen',
		email: 'riley@example.test'
	});
	await seedUser(db, {
		id: 'user-mia',
		firstName: 'Mia',
		lastName: 'Rivera',
		email: 'mia@example.test'
	});
	await seedUser(db, {
		id: 'user-noah',
		firstName: 'Noah',
		lastName: 'Rivera',
		email: 'noah@example.test'
	});
	await db.insert(families).values({ id: 'family-chen', name: 'The Chens' });
	await db.insert(familyMembers).values([
		{ userId: 'user-me', familyId: 'family-chen', role: 'owner', memberType: 'parent' },
		{ userId: 'user-mia', familyId: 'family-chen', role: 'member', memberType: 'child' },
		{ userId: 'user-noah', familyId: 'family-chen', role: 'member', memberType: 'child' }
	]);
	await db.insert(userSettings).values({
		userId: 'user-me',
		timeZone: 'UTC',
		showDailyVerse: true,
		verseTranslation: 'esv'
	});
	await db.insert(calendars).values([
		{ id: 'cal-own', ownerId: 'user-me' },
		{ id: 'cal-family', ownerId: 'user-me', familyId: 'family-chen' }
	]);
	await db.insert(events).values([
		{
			id: 'event-dentist',
			calendarId: 'cal-own',
			ownerId: 'user-me',
			title: 'Dentist',
			start: '2026-11-02T09:00:00.000Z',
			end: '2026-11-02T10:00:00.000Z',
			location: 'Clinic'
		},
		// Ends exactly at the viewed day's 00:00 — the end is exclusive (#285).
		{
			id: 'event-night',
			calendarId: 'cal-own',
			ownerId: 'user-me',
			title: 'Night shift',
			start: '2026-11-01T22:00:00.000Z',
			end: '2026-11-02T00:00:00.000Z'
		},
		{
			id: 'event-soccer',
			calendarId: 'cal-family',
			ownerId: 'user-me',
			title: 'Soccer',
			start: '2026-11-02T15:00:00.000Z',
			end: '2026-11-02T16:00:00.000Z',
			location: 'Field 2'
		}
	]);
	await db.insert(eventAttendance).values([
		{ eventId: 'event-soccer', userId: 'user-me', status: 'going', inviteType: 'required' },
		{ eventId: 'event-soccer', userId: 'user-mia', status: 'maybe', inviteType: 'optional' },
		{ eventId: 'event-soccer', userId: 'user-noah', status: 'declined', inviteType: 'optional' }
	]);
	await db.insert(tasks).values([
		{
			id: 'task-rent',
			title: 'Pay rent',
			userId: 'user-me',
			priority: 'high',
			dueDate: '2026-11-02T08:00:00.000Z',
			createdAt: new Date('2026-10-27T00:00:00.000Z')
		},
		{
			id: 'task-plants',
			title: 'Water plants',
			userId: 'user-me',
			completedAt: '2026-11-02T12:00:00.000Z',
			createdAt: new Date('2026-10-26T00:00:00.000Z')
		},
		{
			id: 'task-room',
			title: 'Tidy room',
			userId: 'user-mia',
			familyId: 'family-chen',
			priority: 'high',
			dueDate: '2026-11-01T09:00:00.000Z',
			assignedTo: 'user-mia',
			assignmentStatus: 'accepted',
			createdAt: new Date('2026-10-28T00:00:00.000Z')
		},
		{
			id: 'task-cat',
			title: 'Feed cat',
			userId: 'user-mia',
			familyId: 'family-chen',
			priority: 'low',
			createdAt: new Date('2026-10-30T00:00:00.000Z')
		},
		{
			id: 'task-piano',
			title: 'Practice piano',
			userId: 'user-me',
			familyId: 'family-chen',
			recurrenceFrequency: 'daily',
			recurrenceInterval: 1,
			createdAt: new Date('2026-10-25T00:00:00.000Z')
		},
		// Q-005a: the board hides another member's private Task.
		{
			id: 'task-diary',
			title: 'My diary',
			userId: 'user-mia',
			familyId: 'family-chen',
			visibility: 'private',
			priority: 'low',
			createdAt: new Date('2026-10-24T00:00:00.000Z')
		}
	]);
	// A recurring check-off never sets tasks.completedAt; it is recovered from
	// the completion history instead.
	await db.insert(taskCompletions).values({
		id: 'completion-piano',
		taskId: 'task-piano',
		userId: 'user-me',
		actorId: 'user-me',
		familyId: 'family-chen',
		completedAt: '2026-11-02T07:00:00.000Z'
	});
	await db.insert(taskCategories).values({
		id: 'category-errands',
		userId: 'user-me',
		name: 'Errands'
	});
	await db.insert(groceryItems).values([
		{
			id: 'grocery-milk',
			userId: 'user-me',
			familyId: 'family-chen',
			name: 'Milk',
			nameKey: 'milk',
			stores: ['Costco']
		},
		{ id: 'grocery-bread', userId: 'user-me', name: 'Bread', nameKey: 'bread', stores: [] }
	]);
	return { me };
}

describe('loadDayDashboard', () => {
	rollbackTest('composes every leg of a family day in the viewer zone', async (db) => {
		const { me } = await seedFamilyDay(db);
		const page = await loadDayDashboard(ctx(db), actorFromUser(me, 'session'), {
			date: '2026-11-02'
		});
		const data = await page.data;

		expect(page.zone).toBe('UTC');
		expect(Date.parse(page.dayISO)).toBe(Date.parse('2026-11-02T00:00:00.000Z'));
		expect(page.isToday).toBe(false);
		expect(page.meId).toBe('user-me');
		expect(page.familyId).toBe('family-chen');
		expect(page.modules).toEqual({
			verse: true,
			glance: true,
			top3: true,
			completed: true,
			board: true,
			kids: true,
			groceries: true,
			meals: true
		});
		expect(page.taskCategories).toEqual([{ id: 'category-errands', name: 'Errands' }]);
		expect(page.loadWarnings).toEqual([]);
		expect(data.warnings).toEqual([]);

		// The viewer's list: own Tasks plus the family's readable ones, newest first.
		expect(data.userTasks.map((row) => row.id)).toEqual([
			'task-cat',
			'task-room',
			'task-rent',
			'task-plants',
			'task-piano'
		]);
		// The board: readable family Tasks, OPEN only (no Done chore) — Q-005a
		// keeps another member's private Task off it.
		expect(data.familyTasks.map((row) => row.id)).toEqual(['task-cat', 'task-room', 'task-piano']);
		expect(data.familyTasks[1]?.creatorFirstName).toBe('Mia');
		expect(data.familyMembers.map((row) => row.userId).sort()).toEqual([
			'user-me',
			'user-mia',
			'user-noah'
		]);

		// Overlap, not start-on-day: the overnight event ending at 00:00 is out.
		// Q-094 fallback: this family has no configured colour, so its events keep
		// `#e0ffff` (the http golden pins the configured-colour rule).
		expect(data.dayEvents.map((event) => [event.title, event.source, event.color])).toEqual([
			['Dentist', 'own', '#fa8072'],
			['Soccer', 'family', '#e0ffff']
		]);
		expect(data.dayEvents[1]?.attendance).toEqual({
			going: 1,
			invited: 3,
			required: 1,
			requiredPending: 0,
			goingNames: ['Riley']
		});
		expect(data.dayEvents[1]?.rsvpStatus).toBe('going');

		// Top-3: mine first, then priority; at most three; the exact input rows.
		const byId = new Map(data.userTasks.map((row) => [row.id, row]));
		expect(data.top3).toEqual(['task-rent', 'task-piano', 'task-room'].map((id) => byId.get(id)));
		// Q-093: `task-room` is overdue (due the day before), so only `task-rent` counts.
		expect(data.glance).toEqual({ doneToday: 2, openToday: 1, weekStreak: expect.any(Number) });
		// Both completed rows are ISO on the way out, whichever side wrote them.
		expect(data.completedToday).toEqual([
			{ id: 'task-plants', title: 'Water plants', completedAt: '2026-11-02T12:00:00.000Z' },
			{ id: 'completion-piano', title: 'Practice piano', completedAt: '2026-11-02T07:00:00.000Z' }
		]);
		expect(data.kidsSchedule).toEqual([
			{
				id: 'event-soccer~2026-11-02T15:00:00.000Z',
				title: 'Soccer',
				start: '2026-11-02T15:00:00.000Z',
				end: '2026-11-02T16:00:00.000Z',
				allDay: false,
				location: 'Field 2',
				kids: [{ id: 'user-mia', name: 'Mia' }]
			}
		]);
		expect(data.familyGroceries).toEqual([{ name: 'Milk', stores: ['Costco'] }]);
		expect(data.mineGroceries).toEqual([{ name: 'Bread', stores: [] }]);
	});

	rollbackTest('skips the reads no visible module needs', async (db) => {
		const me = await seedUser(db, { id: 'user-me', firstName: 'Riley', lastName: 'Chen' });
		await seedUser(db, { id: 'user-mia', firstName: 'Mia', lastName: 'Rivera' });
		await db.insert(families).values({ id: 'family-chen', name: 'The Chens' });
		await db.insert(familyMembers).values([
			{ userId: 'user-me', familyId: 'family-chen', role: 'owner', memberType: 'parent' },
			{ userId: 'user-mia', familyId: 'family-chen', role: 'member', memberType: 'child' }
		]);
		// Glance and Kids hidden by the member; the family switched the board off.
		await db.insert(userSettings).values({
			userId: 'user-me',
			timeZone: 'UTC',
			showDailyVerse: true,
			hiddenDashboardModules: ['glance', 'kids']
		});
		await db.insert(dashboardModuleSwitches).values({
			familyId: 'family-chen',
			module: 'board',
			enabled: false
		});
		await db.insert(calendars).values([
			{ id: 'cal-own', ownerId: 'user-me' },
			{ id: 'cal-family', ownerId: 'user-me', familyId: 'family-chen' }
		]);
		await db.insert(events).values([
			{
				id: 'event-dentist',
				calendarId: 'cal-own',
				ownerId: 'user-me',
				title: 'Dentist',
				start: '2026-11-02T09:00:00.000Z',
				end: '2026-11-02T10:00:00.000Z'
			},
			{
				id: 'event-soccer',
				calendarId: 'cal-family',
				ownerId: 'user-me',
				title: 'Soccer',
				start: '2026-11-02T15:00:00.000Z',
				end: '2026-11-02T16:00:00.000Z'
			}
		]);
		await db.insert(tasks).values({
			id: 'task-cat',
			title: 'Feed cat',
			userId: 'user-mia',
			familyId: 'family-chen'
		});
		await db.insert(groceryItems).values({
			id: 'grocery-bread',
			userId: 'user-me',
			name: 'Bread',
			nameKey: 'bread'
		});

		const page = await loadDayDashboard(ctx(db), actorFromUser(me, 'session'), {
			date: '2026-11-02'
		});
		const data = await page.data;

		expect(page.modules).toEqual({
			verse: true,
			glance: false,
			top3: true,
			completed: true,
			board: false,
			kids: false,
			groceries: true,
			meals: true
		});
		// Family day events feed only Glance/Kids; the own event stays.
		expect(data.dayEvents.map((event) => event.title)).toEqual(['Dentist']);
		// No visible module needs the board, the roster or the attendance join.
		expect(data.familyTasks).toEqual([]);
		expect(data.familyMembers).toEqual([]);
		expect(data.kidsSchedule).toEqual([]);
		expect(data.familyGroceries).toEqual([]);
		expect(data.mineGroceries).toEqual([{ name: 'Bread', stores: [] }]);
	});

	rollbackTest('reads the viewed day in the stored zone, not in UTC', async (db) => {
		const me = await seedUser(db, { id: 'user-me', firstName: 'Riley', lastName: 'Chen' });
		// 03:00Z on Nov 2 is still Nov 1 in Chicago, so this event is not on the
		// viewed day there (true under either side of the DST boundary).
		await db.insert(userSettings).values({ userId: 'user-me', timeZone: 'America/Chicago' });
		await db.insert(calendars).values({ id: 'cal-own', ownerId: 'user-me' });
		await db.insert(events).values({
			id: 'event-early',
			calendarId: 'cal-own',
			ownerId: 'user-me',
			title: 'Early call',
			start: '2026-11-02T03:00:00.000Z',
			end: '2026-11-02T04:00:00.000Z'
		});

		const page = await loadDayDashboard(ctx(db), actorFromUser(me, 'session'), {
			date: '2026-11-02'
		});
		const data = await page.data;

		expect(page.zone).toBe('America/Chicago');
		expect(page.dayISO).toBe('2026-11-02T00:00:00.000-06:00');
		expect(page.isToday).toBe(false);
		expect(data.dayEvents).toEqual([]);
		// No showDailyVerse setting on this row, so the verse module reads hidden.
		expect(page.modules.verse).toBe(false);
	});

	rollbackTest('absent ?date= means today, and a solo account gets empty family legs', async (db) => {
		const me = await seedUser(db, { id: 'user-me', firstName: 'Riley', lastName: 'Chen' });
		await db.insert(groceryItems).values({
			id: 'grocery-bread',
			userId: 'user-me',
			name: 'Bread',
			nameKey: 'bread'
		});

			const page = await loadDayDashboard(ctx(db), actorFromUser(me, 'session'));
			const data = await page.data;

			expect(page.zone).toBe('UTC');
			expect(page.isToday).toBe(true);
			// The viewed day is the fixed clock's day, never the host's.
			expect(Date.parse(page.dayISO)).toBe(Date.parse('2026-01-15T00:00:00.000Z'));
			expect(page.familyId).toBeNull();
			expect(page.modules.verse).toBe(false);
			expect(page.taskCategories).toEqual([]);
			expect(data.userTasks).toEqual([]);
			expect(data.familyTasks).toEqual([]);
			expect(data.familyMembers).toEqual([]);
			expect(data.dayEvents).toEqual([]);
			expect(data.top3).toEqual([]);
			expect(data.glance).toEqual({ doneToday: 0, openToday: 0, weekStreak: 0 });
			expect(data.completedToday).toEqual([]);
			expect(data.kidsSchedule).toEqual([]);
			expect(data.familyGroceries).toEqual([]);
			expect(data.mineGroceries).toEqual([{ name: 'Bread', stores: [] }]);
		expect(page.loadWarnings).toEqual([]);
		expect(data.warnings).toEqual([]);
	});

	rollbackTest('falls back to today for a well-formed but impossible date', async (db) => {
		const me = await seedUser(db, { id: 'user-me' });
		const page = await loadDayDashboard(ctx(db), actorFromUser(me, 'session'), {
			date: '2026-02-31'
		});

		expect(page.isToday).toBe(true);
		expect(Date.parse(page.dayISO)).toBe(Date.parse('2026-01-15T00:00:00.000Z'));
	});
});
