/**
 * The `/api/dashboard` wire contract: the `?date=` query and the resolved
 * payload. Expected values are the frozen golden's
 * (`dayDashboard.http.db.test.ts`), not this module's service.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { firstIssueMessage, z } from '$lib/kernel/validation/validators';
import {
	DASHBOARD_INVALID_DATE,
	DashboardCompletedRow,
	DashboardData,
	DashboardDayEventRow,
	DashboardDayQuery,
	DashboardFamilyTaskRow,
	DashboardGroceryRow,
	DashboardKidsEventRow,
	DashboardModel,
	DashboardRosterRow,
	DashboardUserTaskRow
} from './dayDashboard.contract';

function messageOf(schema: z.ZodType, value: unknown): string | null {
	const result = schema.safeParse(value);
	return result.success ? null : firstIssueMessage(result.error);
}

/** The golden's `userTasks` row for `task-rent`. */
const userTaskRow = {
	id: 'task-rent',
	title: 'Pay rent',
	notes: null,
	dueDate: '2026-11-02 08:00:00+00',
	completedAt: null,
	archivedAt: null,
	recurrenceFrequency: null,
	recurrenceInterval: null,
	completionCount: 0,
	assignedTo: null,
	assignmentStatus: 'none',
	priority: 'high',
	visibility: 'public',
	focusMinutes: null,
	focusStartedAt: null,
	category: null,
	assigneeFirstName: null,
	assigneeLastName: null,
	userId: 'user-me',
	familyId: null,
	eventId: null,
	createdAt: '2026-10-27T00:00:00.000Z',
	eventTitle: null,
	eventStart: null,
	eventCalendarId: null,
	tags: []
};

/** The golden's `familyTasks` row for `task-cat` (creator name, no calendar). */
const familyTaskRow = {
	id: 'task-cat',
	title: 'Feed cat',
	notes: null,
	dueDate: null,
	completedAt: null,
	archivedAt: null,
	recurrenceFrequency: null,
	recurrenceInterval: null,
	completionCount: 0,
	assignedTo: null,
	assignmentStatus: 'none',
	priority: 'low',
	visibility: 'public',
	focusMinutes: null,
	focusStartedAt: null,
	category: null,
	assigneeFirstName: null,
	assigneeLastName: null,
	userId: 'user-mia',
	familyId: 'family-chen',
	eventId: null,
	createdAt: '2026-10-30T00:00:00.000Z',
	eventTitle: null,
	eventStart: null,
	creatorFirstName: 'Mia',
	tags: []
};

/** The golden's `dayEvents` row for `event-dentist`. */
const dayEventRow: DashboardDayEventRow = {
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
	created_at: '2026-11-01 12:00:00',
	color: '#fa8072',
	source: 'own'
};

/** The golden's resolved body for the family day, one row per leg. */
const FAMILY_DAY: DashboardModel = {
	zone: 'UTC',
	dayISO: '2026-11-02T00:00:00.000Z',
	isToday: false,
	meId: 'user-me',
	familyId: 'family-chen',
	modules: {
		verse: true,
		glance: true,
		top3: true,
		completed: true,
		board: true,
		kids: true,
		groceries: true,
		meals: true
	},
	taskCategories: [{ id: 'category-errands', name: 'Errands' }],
	data: {
		userTasks: [userTaskRow],
		familyTasks: [familyTaskRow],
		familyMembers: [
			{
				userId: 'user-me',
				firstName: 'Riley',
				lastName: 'Chen',
				email: 'riley@example.test',
				role: 'owner',
				memberType: 'parent'
			}
		],
		dayEvents: [dayEventRow],
		top3: [userTaskRow],
		glance: { doneToday: 2, openToday: 2, weekStreak: 4 },
		completedToday: [
			{ id: 'task-plants', title: 'Water plants', completedAt: '2026-11-02T12:00:00.000Z' }
		],
		kidsSchedule: [
			{
				id: 'event-soccer~2026-11-02T15:00:00.000Z',
				title: 'Soccer',
				start: '2026-11-02T15:00:00.000Z',
				end: '2026-11-02T16:00:00.000Z',
				allDay: false,
				location: 'Field 2',
				kids: [{ id: 'user-mia', name: 'Mia' }]
			}
		],
		familyGroceries: [{ name: 'Milk', stores: ['Costco'] }],
		mineGroceries: [{ name: 'Bread', stores: [] }]
	},
	warnings: []
};

const DATA_KEYS: readonly (keyof DashboardData)[] = [
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

const HEADER_KEYS: readonly (keyof DashboardModel)[] = [
	'zone',
	'dayISO',
	'isToday',
	'meId',
	'familyId',
	'modules',
	'taskCategories',
	'data',
	'warnings'
];

describe('DashboardDayQuery', () => {
	it('treats an absent date as today', () => {
		expect(DashboardDayQuery.parse({})).toEqual({});
	});

	it('reads a ten-digit date', () => {
		expect(DashboardDayQuery.parse({ date: '2026-11-02' })).toEqual({ date: '2026-11-02' });
	});

	// The golden's today-fallback case: well-formed, yet February has no 31st.
	it('accepts a well-formed date the calendar cannot hold', () => {
		expect(DashboardDayQuery.parse({ date: '2026-02-31' })).toEqual({ date: '2026-02-31' });
	});

	it('ignores other query parameters, as the route always did', () => {
		expect(DashboardDayQuery.parse({ date: '2026-11-02', view: 'day' })).toEqual({
			date: '2026-11-02'
		});
	});

	it.each<[string, unknown]>([
		['a slash-separated date', '11/02/2026'],
		['a date with a time', '2026-11-02T00:00:00'],
		['an unpadded month and day', '2026-1-2'],
		['an empty value (?date=)', ''],
		['a padded value', ' 2026-11-02'],
		['a number', 20261102],
		['null', null]
	])('answers 400 for %s', (_label, date) => {
		expect(messageOf(DashboardDayQuery, { date })).toBe(DASHBOARD_INVALID_DATE);
	});

	it('keeps the legacy copy', () => {
		expect(DASHBOARD_INVALID_DATE).toBe('Invalid date');
	});
});

describe('DashboardModel', () => {
	it('parses the resolved family-day body unchanged', () => {
		expect(DashboardModel.parse(FAMILY_DAY)).toEqual(FAMILY_DAY);
	});

	it('has exactly the golden’s nine header keys', () => {
		expect(Object.keys(DashboardModel.parse(FAMILY_DAY)).sort()).toEqual([...HEADER_KEYS].sort());
	});

	it.each(HEADER_KEYS)('requires the %s header key', (key) => {
		const body: Partial<DashboardModel> = { ...FAMILY_DAY };
		delete body[key];
		expect(DashboardModel.safeParse(body).success).toBe(false);
	});

	it.each(DATA_KEYS)('requires the %s leg', (key) => {
		const data: Partial<DashboardData> = { ...FAMILY_DAY.data };
		delete data[key];
		expect(DashboardModel.safeParse({ ...FAMILY_DAY, data }).success).toBe(false);
	});

	it('accepts a solo account: no family, every family leg empty', () => {
		const body = {
			...FAMILY_DAY,
			familyId: null,
			data: {
				...FAMILY_DAY.data,
				familyTasks: [],
				familyMembers: [],
				top3: [],
				completedToday: [],
				kidsSchedule: [],
				familyGroceries: []
			}
		};
		expect(DashboardModel.safeParse(body).success).toBe(true);
	});

	it('keeps every warning label the service records', () => {
		const body = { ...FAMILY_DAY, warnings: ['settings', 'tasks', 'task-wins'] };
		expect(DashboardModel.parse(body).warnings).toEqual(['settings', 'tasks', 'task-wins']);
	});

	it.each<[string, unknown]>([
		['a non-boolean isToday', { ...FAMILY_DAY, isToday: 'false' }],
		['a numeric meId', { ...FAMILY_DAY, meId: 1 }],
		['a non-list warnings', { ...FAMILY_DAY, warnings: 'tasks' }],
		['a non-boolean module switch', { ...FAMILY_DAY, modules: { board: 'off' } }]
	])('refuses %s', (_label, body) => {
		expect(DashboardModel.safeParse(body).success).toBe(false);
	});
});

describe('DashboardData', () => {
	it('parses the ten legs', () => {
		expect(DashboardData.parse(FAMILY_DAY.data)).toEqual(FAMILY_DAY.data);
	});
});

describe('DashboardUserTaskRow', () => {
	it('parses the golden row, Postgres render and all', () => {
		expect(DashboardUserTaskRow.parse(userTaskRow)).toEqual(userTaskRow);
	});

	it('requires the parent Event’s calendar (null = standalone, #069)', () => {
		const { eventCalendarId: _dropped, ...row } = userTaskRow;
		expect(DashboardUserTaskRow.safeParse(row).success).toBe(false);
	});

	it('strips a creator name the user list never selects', () => {
		expect(
			DashboardUserTaskRow.parse({ ...userTaskRow, creatorFirstName: 'Mia' })
		).not.toHaveProperty('creatorFirstName');
	});
});

describe('DashboardFamilyTaskRow', () => {
	it('parses the golden row with the creator’s name joined', () => {
		expect(DashboardFamilyTaskRow.parse(familyTaskRow)).toEqual(familyTaskRow);
	});

	it('requires the creator name the board joins', () => {
		const { creatorFirstName: _dropped, ...row } = familyTaskRow;
		expect(DashboardFamilyTaskRow.safeParse(row).success).toBe(false);
	});
});

describe('DashboardDayEventRow', () => {
	it('parses the golden own event without an RSVP or attendance', () => {
		expect(DashboardDayEventRow.parse(dayEventRow)).toEqual(dayEventRow);
	});

	it.each<[string, string[]]>([
		['an own event', ['own']],
		['a family event', ['family']]
	])('parses %s as a source', (_label, [source]) => {
		expect(DashboardDayEventRow.safeParse({ ...dayEventRow, source }).success).toBe(true);
	});

	it('refuses a source the dashboard never sends', () => {
		expect(
			DashboardDayEventRow.safeParse({ ...dayEventRow, source: 'sponsored' }).success
		).toBe(false);
	});

	it('carries the viewer RSVP and the attendance summary when the event has them', () => {
		const family = {
			...dayEventRow,
			id: 'event-soccer~2026-11-02T15:00:00.000Z',
			masterId: 'event-soccer',
			calendarId: 'cal-family',
			title: 'Soccer',
			color: '#e0ffff',
			source: 'family',
			rsvpStatus: 'going',
			attendance: { going: 1, invited: 3, required: 1, requiredPending: 0, goingNames: ['Riley'] }
		};
		expect(DashboardDayEventRow.parse(family)).toEqual(family);
	});

	it('requires the event’s colour', () => {
		const { color: _dropped, ...row } = dayEventRow;
		expect(DashboardDayEventRow.safeParse(row).success).toBe(false);
	});
});

describe('the remaining legs', () => {
	it('parses a roster row with no email', () => {
		const row = {
			userId: 'user-mia',
			firstName: 'Mia',
			lastName: 'Rivera',
			email: null,
			role: 'member',
			memberType: 'child'
		};
		expect(DashboardRosterRow.parse(row)).toEqual(row);
	});

	it('parses a completed row whose instant is missing', () => {
		const row = { id: 'task-plants', title: 'Water plants', completedAt: null };
		expect(DashboardCompletedRow.parse(row)).toEqual(row);
	});

	it('requires the kids list on a Kids’ Schedule row', () => {
		const row = {
			id: 'event-soccer~2026-11-02T15:00:00.000Z',
			title: 'Soccer',
			start: '2026-11-02T15:00:00.000Z',
			end: null,
			allDay: false,
			location: null
		};
		expect(DashboardKidsEventRow.safeParse(row).success).toBe(false);
		expect(DashboardKidsEventRow.safeParse({ ...row, kids: [] }).success).toBe(true);
	});

	it('parses a grocery row on both scopes', () => {
		expect(DashboardGroceryRow.parse({ name: 'Milk', stores: [] })).toEqual({
			name: 'Milk',
			stores: []
		});
	});
});
