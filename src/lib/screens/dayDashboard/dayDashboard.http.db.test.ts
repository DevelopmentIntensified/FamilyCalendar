/**
 * Golden contract tests for `GET /api/dashboard?date=` (G8) — the Day
 * Dashboard payload the Android app reads. They pin TODAY's legacy wire
 * (status, full body, skip rules, warning labels) through the real route
 * module, so the port can change the inside without changing the client.
 * Behaviour inventory: ./README.md#invariants
 */
import { beforeEach, describe, expect, it } from 'vitest';
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
import { invoke, type InvokeResult } from '$lib/kernel/testing/invokeHandlers.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { testDb, truncateAll } from '$lib/kernel/testing/testDb.server';
import type { JsonValue } from '$lib/kernel/validation/validators';
// The ROUTE module, not the legacy loader: after the port this import still
// names the same file, so the golden runs unchanged on both sides.
import { GET } from '../../../routes/api/dashboard/+server';

/** The response body as the client sees it; `data` stays loose on purpose. */
type Wire = {
	zone: string;
	dayISO: string;
	isToday: boolean;
	meId: string;
	familyId: string | null;
	modules: Record<string, boolean>;
	dailyVerse: Record<string, JsonValue> | null;
	taskCategories: JsonValue;
	data: Record<string, JsonValue>;
	warnings: JsonValue;
};

const ctx = () => testCtx({ db: testDb() });

/**
 * `timestamptz` columns declared `mode: 'string'` reach the wire as the
 * Postgres text render (`2026-11-02 08:00:00+00`), NOT ISO — the client sees
 * the driver's string. Pin that render; the fractional-second digits are the
 * server's to print (verification runs TZ=UTC, so the offset is `+00`).
 */
function postgresInstant(iso: string): RegExp {
	const at = new Date(iso);
	const pad = (part: number) => String(part).padStart(2, '0');
	const date = `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}`;
	const time = `${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())}:${pad(at.getUTCSeconds())}`;
	return new RegExp(`^${date} ${time}(?:\\.\\d{1,6})?\\+00$`);
}

const readWire = (res: InvokeResult): Wire => {
	// SAFETY: this route always answers the JSON object the assertions below pin
	// field by field; the wire type names it rather than re-guarding it per call.
	return res.body as Wire;
};

/** Every canonical Dashboard Module id, visible: no switch off, nothing hidden. */
const ALL_VISIBLE = {
	verse: true,
	glance: true,
	top3: true,
	completed: true,
	board: true,
	kids: true,
	groceries: true,
	meals: true
};

const DATA_KEYS = [
	'userTasks',
	'familyTasks',
	'familyMembers',
	'dayEvents',
	'top3',
	'glance',
	'completedToday',
	'kidsSchedule',
	'familyGroceries',
	'mineGroceries'
];

/**
 * The two task lists have different SELECT shapes on purpose: the user list
 * joins the parent Event (`eventCalendarId`), the family list joins the
 * creator (`creatorFirstName`). Pin both; unifying them would change the wire.
 */
function userTaskRow(overrides: Record<string, unknown>): Record<string, unknown> {
	return {
		dueDate: null,
		completedAt: null,
		notes: null,
		archivedAt: null,
		recurrenceFrequency: null,
		recurrenceInterval: null,
		completionCount: 0,
		assignedTo: null,
		assignmentStatus: 'none',
		priority: 'normal',
		visibility: 'public',
		focusMinutes: null,
		focusStartedAt: null,
		category: null,
		assigneeFirstName: null,
		assigneeLastName: null,
		familyId: null,
		eventId: null,
		// timestamp WITHOUT time zone: the driver's rendering is not the contract.
		createdAt: expect.any(String),
		eventTitle: null,
		eventStart: null,
		eventCalendarId: null,
		tags: [],
		...overrides
	};
}

function familyTaskRow(overrides: Record<string, unknown>): Record<string, unknown> {
	return {
		dueDate: null,
		completedAt: null,
		notes: null,
		archivedAt: null,
		recurrenceFrequency: null,
		recurrenceInterval: null,
		completionCount: 0,
		assignedTo: null,
		assignmentStatus: 'none',
		priority: 'normal',
		visibility: 'public',
		focusMinutes: null,
		focusStartedAt: null,
		category: null,
		assigneeFirstName: null,
		assigneeLastName: null,
		familyId: null,
		eventId: null,
		createdAt: expect.any(String),
		eventTitle: null,
		eventStart: null,
		creatorFirstName: null,
		tags: [],
		...overrides
	};
}

/** A family with two children, a viewed day of events, tasks and groceries. */
async function seedFamilyDay() {
	const db = testDb();
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
	// A stored zone: the viewed day is read there. The verse's own switch is on.
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
	// One child RSVPs maybe (still attending), one declines (excluded).
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
		// Q-005a: TODAY the family read returns other members' private Tasks too.
		{
			id: 'task-diary',
			title: 'My diary',
			userId: 'user-mia',
			familyId: 'family-chen',
			visibility: 'private',
			priority: 'low',
			createdAt: new Date('2026-10-24T00:00:00.000Z')
		},
		{
			id: 'task-chore',
			title: 'Done chore',
			userId: 'user-mia',
			familyId: 'family-chen',
			completedAt: '2026-11-01T10:00:00.000Z',
			createdAt: new Date('2026-10-31T00:00:00.000Z')
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
	return me;
}

describe('GET /api/dashboard (G8)', () => {
	beforeEach(truncateAll);

	it('401 {"error":"Unauthorized"} when signed out', async () => {
		const res = await invoke(GET, { ctx: ctx(), path: '/api/dashboard' });
		expect(res.status).toBe(401);
		expect(res.body).toEqual({ error: 'Unauthorized' });
	});

	it('400 {"error":"Invalid date"} for a date that is not YYYY-MM-DD', async () => {
		const me = await seedUser(testDb(), { id: 'user-me' });
		for (const date of ['11/02/2026', '2026-11-02T00:00:00', '2026-1-2']) {
			const res = await invoke(GET, {
				ctx: ctx(),
				user: me,
				path: '/api/dashboard',
				query: { date }
			});
			expect(res.status).toBe(400);
			expect(res.body).toEqual({ error: 'Invalid date' });
		}
	});

	it('returns the full contract for a family day, resolved, in the viewer zone', async () => {
		const me = await seedFamilyDay();
		const res = await invoke(GET, {
			ctx: ctx(),
			user: me,
			path: '/api/dashboard',
			query: { date: '2026-11-02' }
		});
		expect(res.status).toBe(200);
		const wire = readWire(res);

		expect(Object.keys(wire).sort()).toEqual(
			[
				'zone',
				'dayISO',
				'isToday',
				'meId',
				'familyId',
				'modules',
				'dailyVerse',
				'taskCategories',
				'data',
				'warnings'
			].sort()
		);
		expect(wire.zone).toBe('UTC');
		// Midnight in the viewer zone; the exact offset rendering is luxon's.
		expect(Date.parse(wire.dayISO)).toBe(Date.parse('2026-11-02T00:00:00.000Z'));
		expect(wire.isToday).toBe(false);
		expect(wire.meId).toBe('user-me');
		expect(wire.familyId).toBe('family-chen');
		expect(wire.modules).toEqual(ALL_VISIBLE);
		expect(wire.taskCategories).toEqual([{ id: 'category-errands', name: 'Errands' }]);
		// The bundled verse is chosen by the REAL clock's ordinal: assert shape.
		expect(wire.dailyVerse).toEqual({
			reference: expect.any(String),
			text: expect.any(String),
			attribution: 'Public domain.',
			translation: 'esv',
			fallback: false
		});
		expect(wire.warnings).toEqual([]);
		expect(Object.keys(wire.data).sort()).toEqual([...DATA_KEYS].sort());

		// The viewer's list: own Tasks + every Family Task, completed included,
		// newest first. This is the payload the phone reads (spec's `<Task+tags>`).
		// `dueDate`/`completedAt` are timestamptz `mode: 'string'`: the wire carries
		// the driver's Postgres render (space, `+00`), not ISO.
		expect(wire.data.userTasks).toEqual([
			userTaskRow({
				id: 'task-chore',
				title: 'Done chore',
				userId: 'user-mia',
				familyId: 'family-chen',
				completedAt: expect.stringMatching(postgresInstant('2026-11-01T10:00:00.000Z'))
			}),
			userTaskRow({
				id: 'task-cat',
				title: 'Feed cat',
				userId: 'user-mia',
				familyId: 'family-chen',
				priority: 'low'
			}),
			userTaskRow({
				id: 'task-room',
				title: 'Tidy room',
				userId: 'user-mia',
				familyId: 'family-chen',
				priority: 'high',
				dueDate: expect.stringMatching(postgresInstant('2026-11-01T09:00:00.000Z')),
				assignedTo: 'user-mia',
				assignmentStatus: 'accepted',
				assigneeFirstName: 'Mia',
				assigneeLastName: 'Rivera'
			}),
			userTaskRow({
				id: 'task-rent',
				title: 'Pay rent',
				userId: 'user-me',
				priority: 'high',
				dueDate: expect.stringMatching(postgresInstant('2026-11-02T08:00:00.000Z'))
			}),
			userTaskRow({
				id: 'task-plants',
				title: 'Water plants',
				userId: 'user-me',
				completedAt: expect.stringMatching(postgresInstant('2026-11-02T12:00:00.000Z'))
			}),
			userTaskRow({
				id: 'task-piano',
				title: 'Practice piano',
				userId: 'user-me',
				familyId: 'family-chen',
				recurrenceFrequency: 'daily',
				recurrenceInterval: 1
			}),
			userTaskRow({
				id: 'task-diary',
				title: 'My diary',
				userId: 'user-mia',
				familyId: 'family-chen',
				visibility: 'private',
				priority: 'low'
			})
		]);

		// The board list: family Tasks, OPEN only (Done chore is gone), newest
		// first, with the creator name joined. Q-005a leak pinned: `task-diary`
		// is another member's private Task and is on the board TODAY.
		expect(wire.data.familyTasks).toEqual([
			familyTaskRow({
				id: 'task-cat',
				title: 'Feed cat',
				userId: 'user-mia',
				familyId: 'family-chen',
				priority: 'low',
				creatorFirstName: 'Mia'
			}),
			familyTaskRow({
				id: 'task-room',
				title: 'Tidy room',
				userId: 'user-mia',
				familyId: 'family-chen',
				priority: 'high',
				dueDate: expect.stringMatching(postgresInstant('2026-11-01T09:00:00.000Z')),
				assignedTo: 'user-mia',
				assignmentStatus: 'accepted',
				assigneeFirstName: 'Mia',
				assigneeLastName: 'Rivera',
				creatorFirstName: 'Mia'
			}),
			familyTaskRow({
				id: 'task-piano',
				title: 'Practice piano',
				userId: 'user-me',
				familyId: 'family-chen',
				recurrenceFrequency: 'daily',
				recurrenceInterval: 1,
				creatorFirstName: 'Riley'
			}),
			familyTaskRow({
				id: 'task-diary',
				title: 'My diary',
				userId: 'user-mia',
				familyId: 'family-chen',
				visibility: 'private',
				priority: 'low',
				creatorFirstName: 'Mia'
			})
		]);

		// The roster is unordered by the query; compare as a set.
		// SAFETY: the wire field is an array of roster rows; the expectation below pins all six keys.
		const members = (wire.data.familyMembers as { userId: string }[])
			.slice()
			.sort((a, b) => a.userId.localeCompare(b.userId));
		expect(members).toEqual(
			[
				{
					userId: 'user-me',
					firstName: 'Riley',
					lastName: 'Chen',
					email: 'riley@example.test',
					role: 'owner',
					memberType: 'parent'
				},
				{
					userId: 'user-mia',
					firstName: 'Mia',
					lastName: 'Rivera',
					email: 'mia@example.test',
					role: 'member',
					memberType: 'child'
				},
				{
					userId: 'user-noah',
					firstName: 'Noah',
					lastName: 'Rivera',
					email: 'noah@example.test',
					role: 'member',
					memberType: 'child'
				}
			].sort((a, b) => a.userId.localeCompare(b.userId))
		);

		// Overlap, not start-on-day: the overnight event ending at 00:00 is out.
		// The wire row is the whole Event (all 17 columns) plus the expansion and
		// dashboard fields; `created_at` is timestamp WITHOUT time zone, so the
		// driver's rendering is not the client contract.
		// SAFETY: the wire field is an array of event rows; the projection below pins every field read.
		const dayEvents = wire.data.dayEvents as Record<string, JsonValue>[];
		expect(dayEvents.map((e) => e.title)).toEqual(['Dentist', 'Soccer']);
		expect(
			dayEvents.map((e) => ({
				id: e.id,
				masterId: e.masterId,
				calendarId: e.calendarId,
				ownerId: e.ownerId,
				title: e.title,
				description: e.description,
				location: e.location,
				allDay: e.allDay,
				start: e.start,
				end: e.end,
				occurrenceDate: e.occurrenceDate,
				date: e.date,
				recurrenceFrequency: e.recurrenceFrequency,
				recurrenceInterval: e.recurrenceInterval,
				recurrenceByDay: e.recurrenceByDay,
				recurrenceCount: e.recurrenceCount,
				recurrenceUntil: e.recurrenceUntil,
				reminderMinutes: e.reminderMinutes,
				mirrorOf: e.mirrorOf,
				created_at: e.created_at,
				color: e.color,
				source: e.source,
				rsvpStatus: e.rsvpStatus,
				attendance: e.attendance
			}))
		).toEqual([
			{
				id: 'event-dentist~2026-11-02T09:00:00.000Z',
				masterId: 'event-dentist',
				calendarId: 'cal-own',
				ownerId: 'user-me',
				title: 'Dentist',
				description: null,
				location: 'Clinic',
				allDay: false,
				start: '2026-11-02T09:00:00.000Z',
				end: '2026-11-02T10:00:00.000Z',
				occurrenceDate: '2026-11-02T09:00:00.000Z',
				date: '2026-11-02T09:00:00.000Z',
				recurrenceFrequency: null,
				recurrenceInterval: null,
				recurrenceByDay: null,
				recurrenceCount: null,
				recurrenceUntil: null,
				reminderMinutes: null,
				mirrorOf: null,
				created_at: expect.any(String),
				// Personal colour falls back to the settings colour, then #fa8072.
				color: '#fa8072',
				source: 'own',
				rsvpStatus: undefined,
				attendance: undefined
			},
			{
				id: 'event-soccer~2026-11-02T15:00:00.000Z',
				masterId: 'event-soccer',
				calendarId: 'cal-family',
				ownerId: 'user-me',
				title: 'Soccer',
				description: null,
				location: 'Field 2',
				allDay: false,
				start: '2026-11-02T15:00:00.000Z',
				end: '2026-11-02T16:00:00.000Z',
				occurrenceDate: '2026-11-02T15:00:00.000Z',
				date: '2026-11-02T15:00:00.000Z',
				recurrenceFrequency: null,
				recurrenceInterval: null,
				recurrenceByDay: null,
				recurrenceCount: null,
				recurrenceUntil: null,
				reminderMinutes: null,
				mirrorOf: null,
				created_at: expect.any(String),
				// The family colour is hard-coded, not read from the family.
				color: '#e0ffff',
				source: 'family',
				rsvpStatus: 'going',
				attendance: { going: 1, invited: 3, required: 1, requiredPending: 0, goingNames: ['Riley'] }
			}
		]);

		// Top-3: mine first, then priority; at most three; the exact input rows.
		// SAFETY: `top3` holds rows of `userTasks` on this payload, so index by id.
		const byId = new Map((wire.data.userTasks as { id: string }[]).map((row) => [row.id, row]));
		expect(wire.data.top3).toEqual(
			['task-rent', 'task-piano', 'task-room'].map((id) => byId.get(id))
		);

		// Glance counts are the viewer's: open Tasks due before the day's end
		// (overdue included, no lower bound), and the day's wins.
		expect(wire.data.glance).toEqual({
			doneToday: 2,
			openToday: 2,
			// The streak is computed against the REAL clock: shape only.
			weekStreak: expect.any(Number)
		});
		// `completedToday` is rebuilt to ISO on the way out — the one-off rows via
		// `new Date(row.completedAt).toISOString()`, the recurring history via
		// `toIsoTimestamp` — so this card carries ISO whatever the driver rendered.
		expect(wire.data.completedToday).toEqual([
			{ id: 'task-plants', title: 'Water plants', completedAt: '2026-11-02T12:00:00.000Z' },
			{ id: 'completion-piano', title: 'Practice piano', completedAt: '2026-11-02T07:00:00.000Z' }
		]);
		expect(wire.data.kidsSchedule).toEqual([
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
		expect(wire.data.familyGroceries).toEqual([{ name: 'Milk', stores: ['Costco'] }]);
		expect(wire.data.mineGroceries).toEqual([{ name: 'Bread', stores: [] }]);
	});

	it('skips the reads no visible module needs, and still answers 200', async () => {
		const db = testDb();
		const me = await seedUser(db, {
			id: 'user-me',
			firstName: 'Riley',
			lastName: 'Chen',
			email: 'riley@example.test'
		});
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

		const res = await invoke(GET, {
			ctx: ctx(),
			user: me,
			path: '/api/dashboard',
			query: { date: '2026-11-02' }
		});
		expect(res.status).toBe(200);
		const wire = readWire(res);
		expect(wire.modules).toEqual({
			...ALL_VISIBLE,
			glance: false,
			board: false,
			kids: false
		});
		// The family day events are only read for Glance/Kids: the own event stays.
		// SAFETY: `dayEvents` is an array of event rows; only the titles matter here.
		expect((wire.data.dayEvents as { title: string }[]).map((e) => e.title)).toEqual(['Dentist']);
		// No visible module needs the board, the roster or the attendance join.
		expect(wire.data.familyTasks).toEqual([]);
		expect(wire.data.familyMembers).toEqual([]);
		expect(wire.data.kidsSchedule).toEqual([]);
		// Groceries and the verse are unaffected by those hides.
		expect(wire.data.mineGroceries).toEqual([{ name: 'Bread', stores: [] }]);
		expect(wire.data.familyGroceries).toEqual([]);
		expect(wire.dailyVerse).toEqual({
			reference: expect.any(String),
			text: expect.any(String),
			attribution: 'Public domain.',
			translation: 'esv',
			fallback: false
		});
		expect(wire.warnings).toEqual([]);
	});

	it('reads the viewed day in the stored zone, not in UTC', async () => {
		const db = testDb();
		const me = await seedUser(db, {
			id: 'user-me',
			firstName: 'Riley',
			lastName: 'Chen',
			email: 'riley@example.test'
		});
		// 03:00Z on Nov 2 is still Nov 1 in Chicago, so this event is not on
		// the viewed day there (true under either side of the DST boundary).
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

		const res = await invoke(GET, {
			ctx: ctx(),
			user: me,
			path: '/api/dashboard',
			query: { date: '2026-11-02' }
		});
		expect(res.status).toBe(200);
		const wire = readWire(res);
		expect(wire.zone).toBe('America/Chicago');
		expect(wire.dayISO).toBe('2026-11-02T00:00:00.000-06:00');
		expect(wire.isToday).toBe(false);
		expect(wire.data.dayEvents).toEqual([]);
		// No settings row would mean no verse; this row has showDailyVerse default off.
		expect(wire.dailyVerse).toBeNull();
		expect(wire.modules).toEqual({ ...ALL_VISIBLE, verse: false });
		expect(wire.warnings).toEqual([]);
	});

	it('absent ?date= means today, and a solo account gets empty family legs', async () => {
		const db = testDb();
		const me = await seedUser(db, {
			id: 'user-me',
			firstName: 'Riley',
			lastName: 'Chen',
			email: 'riley@example.test'
		});
		await db.insert(groceryItems).values({
			id: 'grocery-bread',
			userId: 'user-me',
			name: 'Bread',
			nameKey: 'bread'
		});
		const before = new Date().toISOString().slice(0, 10);

		const res = await invoke(GET, { ctx: ctx(), user: me, path: '/api/dashboard' });
		expect(res.status).toBe(200);
		const wire = readWire(res);
		const after = new Date().toISOString().slice(0, 10);
		expect(wire.zone).toBe('UTC');
		expect(wire.isToday).toBe(true);
		// On legacy the day is the REAL clock's; after the port it is ctx.clock's
		// (testCtx's fixed clock). Accept either source and assert the instant.
		const testClockDay = testCtx().clock.now().toISOString().slice(0, 10);
		expect(
			[...new Set([before, after, testClockDay])].map((day) =>
				Date.parse(`${day}T00:00:00.000Z`)
			)
		).toContain(Date.parse(wire.dayISO));
		expect(wire.familyId).toBeNull();
		// No settings row: the verse is off, the other modules keep their default.
		expect(wire.modules).toEqual({ ...ALL_VISIBLE, verse: false });
		expect(wire.dailyVerse).toBeNull();
		expect(wire.taskCategories).toEqual([]);
		expect(wire.data.userTasks).toEqual([]);
		expect(wire.data.familyTasks).toEqual([]);
		expect(wire.data.familyMembers).toEqual([]);
		expect(wire.data.dayEvents).toEqual([]);
		expect(wire.data.top3).toEqual([]);
		expect(wire.data.glance).toEqual({ doneToday: 0, openToday: 0, weekStreak: 0 });
		expect(wire.data.completedToday).toEqual([]);
		expect(wire.data.kidsSchedule).toEqual([]);
		expect(wire.data.familyGroceries).toEqual([]);
		expect(wire.data.mineGroceries).toEqual([{ name: 'Bread', stores: [] }]);
		expect(wire.warnings).toEqual([]);
	});

	it('falls back to today for a well-formed but impossible date', async () => {
		const me = await seedUser(testDb(), { id: 'user-me' });
		const before = new Date().toISOString().slice(0, 10);
		const res = await invoke(GET, {
			ctx: ctx(),
			user: me,
			path: '/api/dashboard',
			query: { date: '2026-02-31' }
		});
		expect(res.status).toBe(200);
		const wire = readWire(res);
		const after = new Date().toISOString().slice(0, 10);
		expect(wire.isToday).toBe(true);
		// The fallback day is the real clock's on legacy, ctx.clock's after the port.
		const testClockDay = testCtx().clock.now().toISOString().slice(0, 10);
		expect(
			[...new Set([before, after, testClockDay])].map((day) =>
				Date.parse(`${day}T00:00:00.000Z`)
			)
		).toContain(Date.parse(wire.dayISO));
	});
});
