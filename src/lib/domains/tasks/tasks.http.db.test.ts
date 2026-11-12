/**
 * Golden contract tests for the tasks read/create endpoints:
 * `GET|POST /api/tasks`, `GET /api/tasks/sections`, `DELETE /api/tasks/completed`,
 * the `/api/task-categories` CRUD and `GET /api/stats`.
 *
 * They pin TODAY's legacy wire (docs/rewrite/playbooks/characterize-endpoints.md).
 * Doc: ./README.md#how-to-test
 */
import { eq } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { beforeEach, describe, expect, it } from 'vitest';
import {
	calendars,
	events,
	notifications,
	taskCategories,
	taskCompletions,
	tasks
} from '$lib/kernel/db/tables.server';
import type { Db } from '$lib/kernel/db/database.server';
import { invoke } from '$lib/kernel/testing/invokeHandlers.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { testDb, truncateAll } from '$lib/kernel/testing/testDb.server';
import type { JsonValue } from '$lib/kernel/validation/validators';
import {
	addMember,
	seedTaskCategory,
	seedTask,
	seedTaskCompletion,
	seedTaskFamily,
	seedTaskFocusSession,
	seedTaskTags,
	seedUserZone
} from './tasks.fixtures.server';
// Route modules, not actions: after the port these re-export the new handlers,
// so the imports never change (characterize-endpoints.md).
import { GET as getTasks, POST as postTask } from '../../../routes/api/tasks/+server';
import { GET as getSections } from '../../../routes/api/tasks/sections/+server';
import { DELETE as clearCompleted } from '../../../routes/api/tasks/completed/+server';
import { GET as getStats } from '../../../routes/api/stats/+server';
import {
	GET as getCategories,
	POST as postCategory
} from '../../../routes/api/task-categories/+server';
import {
	DELETE as deleteCategory,
	PATCH as patchCategory
} from '../../../routes/api/task-categories/[id]/+server';

const ctx = () => testCtx({ db: testDb() });
const ISO = /^\d{4}-\d{2}-\d{2}T/;
/** The day legacy uses when the caller has no stored zone: UTC (`new Date().toISOString()`). */
const utcToday = () => DateTime.now().toUTC().startOf('day');
/**
 * A `mode:'string'` timestamptz exactly as Postgres renders it. The `+00`
 * depends on the Postgres session TimeZone, which docker and production both
 * set to UTC (docs/rewrite/modules/tasks.md).
 */
const pgTime = (instant: DateTime) => `${instant.toUTC().toFormat('yyyy-MM-dd HH:mm:ss')}+00`;

function jsonObject(value: unknown): Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new Error(`expected a JSON object, got ${JSON.stringify(value)}`);
	}
	return value as Record<string, unknown>;
}

async function seedCalendar(db: Db, values: typeof calendars.$inferInsert) {
	const [row] = await db.insert(calendars).values(values).returning();
	return row;
}

async function seedEvent(db: Db, values: typeof events.$inferInsert) {
	const [row] = await db.insert(events).values(values).returning();
	return row;
}

describe('GET /api/tasks', () => {
	beforeEach(truncateAll);

	it('returns the caller`s task with tags, event calendar and phone focus', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia', lastName: 'Diaz' });
		const task = await seedTask(db, {
			title: 'Buy milk',
			notes: '2 litres',
			dueDate: '2026-02-01T10:00:00.000Z',
			priority: 'high',
			visibility: 'private',
			focusMinutes: 12,
			category: 'Errands',
			createdAt: new Date('2026-01-02T00:00:00.000Z'),
			userId: mia.id
		});
		// Written out of alphabetical order: the wire sorts tags, it never
		// echoes the write order.
		await seedTaskTags(db, task.id, ['shopping', 'milk']);
		// Two closed 90 s phone sessions floor to 3 minutes (#293), an absorbed
		// one and another user's one are ignored.
		const sam = await seedUser(db, { firstName: 'Sam', lastName: 'Roy' });
		await seedTaskFocusSession(db, {
			userId: mia.id,
			taskId: task.id,
			startedAt: new Date('2026-01-03T10:00:00.000Z'),
			endedAt: new Date('2026-01-03T10:01:30.000Z')
		});
		await seedTaskFocusSession(db, {
			userId: mia.id,
			taskId: task.id,
			startedAt: new Date('2026-01-04T10:00:00.000Z'),
			endedAt: new Date('2026-01-04T10:01:30.000Z')
		});
		await seedTaskFocusSession(db, {
			userId: mia.id,
			taskId: task.id,
			startedAt: new Date('2026-01-05T10:00:00.000Z'),
			endedAt: new Date('2026-01-05T10:05:00.000Z'),
			absorbedAt: new Date('2026-01-06T10:00:00.000Z')
		});
		await seedTaskFocusSession(db, {
			userId: sam.id,
			taskId: task.id,
			startedAt: new Date('2026-01-07T10:00:00.000Z'),
			endedAt: new Date('2026-01-07T10:09:00.000Z')
		});

		const res = await invoke(getTasks, { ctx: ctx(), user: mia, path: '/api/tasks' });

		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			tasks: [
				{
					id: task.id,
					title: 'Buy milk',
					notes: '2 litres',
					dueDate: '2026-02-01 10:00:00+00',
					completedAt: null,
					archivedAt: null,
					recurrenceFrequency: null,
					recurrenceInterval: null,
					completionCount: 0,
					assignedTo: null,
					assignmentStatus: 'none',
					priority: 'high',
					visibility: 'private',
					focusMinutes: 12,
					focusStartedAt: null,
					category: 'Errands',
					assigneeFirstName: null,
					assigneeLastName: null,
					userId: mia.id,
					familyId: null,
					eventId: null,
					createdAt: '2026-01-02T00:00:00.000Z',
					eventTitle: null,
					eventStart: null,
					eventCalendarId: null,
					tags: ['milk', 'shopping'],
					phoneFocusMinutes: 3,
					phoneFocusStartedAt: null
				}
			]
		});
	});

	it('attributes the parent event and starts the phone overlay from an open session', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia', lastName: 'Diaz' });
		const calendar = await seedCalendar(db, { ownerId: mia.id });
		const event = await seedEvent(db, {
			ownerId: mia.id,
			calendarId: calendar.id,
			title: 'Dentist',
			start: '2026-03-01T09:00:00.000Z'
		});
		const task = await seedTask(db, {
			title: 'Bring forms',
			eventId: event.id,
			createdAt: new Date('2026-02-02T00:00:00.000Z'),
			userId: mia.id
		});
		await seedTaskFocusSession(db, {
			userId: mia.id,
			taskId: task.id,
			startedAt: new Date('2026-12-01T09:00:00.000Z')
		});

		const res = await invoke(getTasks, { ctx: ctx(), user: mia, path: '/api/tasks' });

		expect(res.status).toBe(200);
		// eventTitle/eventStart come from the joined Event row (both
		// `mode:'string'`); an open phone session contributes the start and no
		// minutes yet.
		expect(res.body).toEqual({
			tasks: [
				{
					id: task.id,
					title: 'Bring forms',
					notes: null,
					dueDate: null,
					completedAt: null,
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
					userId: mia.id,
					familyId: null,
					eventId: event.id,
					createdAt: '2026-02-02T00:00:00.000Z',
					eventTitle: 'Dentist',
					eventStart: '2026-03-01 09:00:00+00',
					eventCalendarId: calendar.id,
					tags: [],
					phoneFocusMinutes: 0,
					phoneFocusStartedAt: '2026-12-01T09:00:00.000Z'
				}
			]
		});
	});

	it('orders newest createdAt first and drops archived tasks', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const older = await seedTask(db, {
			title: 'Older',
			createdAt: new Date('2026-01-01T00:00:00.000Z'),
			userId: mia.id
		});
		const newer = await seedTask(db, {
			title: 'Newer',
			createdAt: new Date('2026-01-03T00:00:00.000Z'),
			userId: mia.id
		});
		await seedTask(db, {
			title: 'Archived',
			createdAt: new Date('2026-01-04T00:00:00.000Z'),
			archivedAt: '2026-01-05T00:00:00.000Z',
			userId: mia.id
		});

		const res = await invoke(getTasks, { ctx: ctx(), user: mia, path: '/api/tasks' });

		expect(res.body).toEqual({
			tasks: [
				expect.objectContaining({ id: newer.id, title: 'Newer' }),
				expect.objectContaining({ id: older.id, title: 'Older' })
			]
		});
	});

	it('includes every row of the caller`s family, another member`s private one too (Q-005a)', async () => {
		// TODAY's wire: the family leg of getTasksForUser ignores visibility, so a
		// member's PRIVATE family task reaches the other member. Q-005a fixes this
		// after S6 (`fix(tasks): Q-005a hide private tasks from family reads`) and
		// changes exactly this golden.
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const sam = await seedUser(db, { firstName: 'Sam' });
		const family = await seedTaskFamily(db);
		await addMember(db, mia.id, family.id);
		await addMember(db, sam.id, family.id);
		const secret = await seedTask(db, {
			title: 'Sam`s secret',
			visibility: 'private',
			familyId: family.id,
			userId: sam.id
		});
		await seedTask(db, {
			title: 'Sam`s personal',
			familyId: null,
			userId: sam.id
		});

		const res = await invoke(getTasks, { ctx: ctx(), user: mia, path: '/api/tasks' });

		expect(res.body).toEqual({
			tasks: [expect.objectContaining({ id: secret.id, title: 'Sam`s secret' })]
		});
	});

	it('answers 200 {tasks:[]} for an unknown eventId', async () => {
		const mia = await seedUser(testDb(), { firstName: 'Mia' });
		const res = await invoke(getTasks, {
			ctx: ctx(),
			user: mia,
			path: '/api/tasks',
			query: { eventId: 'no-such-event' }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ tasks: [] });
	});

	it('answers 403 No access to this event for someone else`s event', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const sam = await seedUser(db, { firstName: 'Sam' });
		const event = await seedEvent(db, {
			ownerId: sam.id,
			title: 'Dentist',
			start: '2026-03-01T09:00:00.000Z'
		});

		const res = await invoke(getTasks, {
			ctx: ctx(),
			user: mia,
			path: '/api/tasks',
			query: { eventId: event.id }
		});

		expect(res.status).toBe(403);
		expect(res.body).toEqual({ error: 'No access to this event' });
	});

	it('lists an accessible event`s tasks, hides another member`s private one (#164)', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const sam = await seedUser(db, { firstName: 'Sam' });
		const family = await seedTaskFamily(db);
		await addMember(db, mia.id, family.id);
		const calendar = await seedCalendar(db, { familyId: family.id });
		const event = await seedEvent(db, {
			ownerId: sam.id,
			calendarId: calendar.id,
			title: 'Dentist',
			start: '2026-03-01T09:00:00.000Z'
		});
		const mine = await seedTask(db, {
			title: 'Bring forms',
			eventId: event.id,
			createdAt: new Date('2026-01-01T00:00:00.000Z'),
			userId: mia.id
		});
		const samsPublic = await seedTask(db, {
			title: 'Sam`s public',
			eventId: event.id,
			createdAt: new Date('2026-01-02T00:00:00.000Z'),
			userId: sam.id
		});
		await seedTask(db, {
			title: 'Sam`s private',
			visibility: 'private',
			eventId: event.id,
			createdAt: new Date('2026-01-03T00:00:00.000Z'),
			userId: sam.id
		});

		const res = await invoke(getTasks, {
			ctx: ctx(),
			user: mia,
			path: '/api/tasks',
			query: { eventId: event.id }
		});

		expect(res.status).toBe(200);
		// The event branch returns the raw task row shape (no tags / eventTitle /
		// assignee names) plus the three derived fields — two shapes on one route.
		expect(res.body).toEqual({
			tasks: [
				{
					id: mine.id,
					title: 'Bring forms',
					notes: null,
					dueDate: null,
					completedAt: null,
					archivedAt: null,
					recurrenceFrequency: null,
					recurrenceInterval: null,
					completionCount: 0,
					assignedTo: null,
					assignmentStatus: 'none',
					priority: 'normal',
					visibility: 'public',
					userId: mia.id,
					familyId: null,
					eventId: event.id,
					focusMinutes: null,
					focusStartedAt: null,
					category: null,
					createdAt: expect.stringMatching(ISO),
					eventCalendarId: calendar.id,
					phoneFocusMinutes: 0,
					phoneFocusStartedAt: null
				},
				expect.objectContaining({ id: samsPublic.id, title: 'Sam`s public' })
			]
		});
	});

	it('leaves a stale recurring event task`s cursor alone on the ?eventId= read', async () => {
		// The event shape reads getTasksForEvent, which does NOT run the overdue
		// pin (queries.ts:72-78): the row keeps its stored due date.
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const family = await seedTaskFamily(db);
		await addMember(db, mia.id, family.id);
		const calendar = await seedCalendar(db, { familyId: family.id });
		const event = await seedEvent(db, {
			ownerId: mia.id,
			calendarId: calendar.id,
			title: 'Dentist',
			start: '2026-03-01T09:00:00.000Z'
		});
		const stale = await seedTask(db, {
			title: 'Water plants',
			dueDate: '2020-01-01T00:00:00.000Z',
			recurrenceFrequency: 'daily',
			recurrenceInterval: 1,
			eventId: event.id,
			createdAt: new Date('2026-01-01T00:00:00.000Z'),
			userId: mia.id
		});

		const res = await invoke(getTasks, {
			ctx: ctx(),
			user: mia,
			path: '/api/tasks',
			query: { eventId: event.id }
		});

		expect(res.status).toBe(200);
		const rows = jsonObject(res.body).tasks as { dueDate: string }[];
		expect(rows.map((row) => row.dueDate)).toEqual(['2020-01-01 00:00:00+00']);
		const [stored] = await db.select().from(tasks).where(eq(tasks.id, stale.id));
		expect(stored.dueDate).toBe('2020-01-01 00:00:00+00');
	});

	it('pins overdue recurring rows to today-end in the token owner`s stored zone (#214)', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		await seedUserZone(db, mia.id, 'Pacific/Kiritimati');
		const stale = await seedTask(db, {
			title: 'Water plants',
			dueDate: '2020-01-01T00:00:00.000Z',
			recurrenceFrequency: 'daily',
			recurrenceInterval: 1,
			createdAt: new Date('2026-01-01T00:00:00.000Z'),
			userId: mia.id
		});
		const todayEnd = DateTime.now()
			.setZone('Pacific/Kiritimati')
			.startOf('day')
			.set({ hour: 23, minute: 59, second: 0, millisecond: 0 });

		const res = await invoke(getTasks, { ctx: ctx(), user: mia, path: '/api/tasks' });

		expect(res.status).toBe(200);
		const rows = jsonObject(res.body).tasks as { dueDate: string; completionCount: number }[];
		expect(rows.map((row) => row.dueDate)).toEqual([pgTime(todayEnd)]);
		expect(rows[0].completionCount).toBe(0);
		expect(await db.select().from(taskCompletions)).toEqual([]);
	});

	it('pins the family leg too, so another member`s cursor is not left stale', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const sam = await seedUser(db, { firstName: 'Sam' });
		const family = await seedTaskFamily(db);
		await addMember(db, mia.id, family.id);
		await addMember(db, sam.id, family.id);
		await seedTask(db, {
			title: 'Family plants',
			dueDate: '2020-01-01T00:00:00.000Z',
			recurrenceFrequency: 'weekly',
			recurrenceInterval: 1,
			familyId: family.id,
			createdAt: new Date('2026-01-01T00:00:00.000Z'),
			userId: sam.id
		});
		// No stored zone, so legacy falls back to `new Date().toISOString()`:
		// the pin is 23:59 in UTC, never in the process zone.
		const todayEnd = utcToday().set({ hour: 23, minute: 59, second: 0, millisecond: 0 });

		const res = await invoke(getTasks, { ctx: ctx(), user: mia, path: '/api/tasks' });

		expect(res.status).toBe(200);
		const rows = jsonObject(res.body).tasks as { dueDate: string }[];
		expect(rows.map((row) => row.dueDate)).toEqual([pgTime(todayEnd)]);
	});

	it('reads one family`s rows for a user in two families, never both (#098)', async () => {
		// getUserFamilyId takes the first familyMembers row and has no ORDER BY
		// (families.ts:251-257), so WHICH family is pinned by neither side today.
		// Pinned here: the read returns one family's rows, never a merge, and the
		// same GET answers the same body twice.
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const sam = await seedUser(db, { firstName: 'Sam' });
		const lee = await seedUser(db, { firstName: 'Lee' });
		const first = await seedTaskFamily(db, 'First');
		const second = await seedTaskFamily(db, 'Second');
		await addMember(db, mia.id, first.id);
		await addMember(db, mia.id, second.id);
		await addMember(db, sam.id, first.id);
		await addMember(db, lee.id, second.id);
		await seedTask(db, { title: 'First chore', familyId: first.id, userId: sam.id });
		await seedTask(db, { title: 'Second chore', familyId: second.id, userId: lee.id });

		const once = await invoke(getTasks, { ctx: ctx(), user: mia, path: '/api/tasks' });
		const twice = await invoke(getTasks, { ctx: ctx(), user: mia, path: '/api/tasks' });

		expect(once.status).toBe(200);
		expect(twice.body).toEqual(once.body);
		const rows = jsonObject(once.body).tasks as { familyId: string }[];
		expect(rows).toHaveLength(1);
		expect([first.id, second.id]).toContain(rows[0].familyId);
	});

	it('answers a token caller the same list as a session caller', async () => {
		// A Bearer `fp_…` request is the same handler with actor.via 'token':
		// nothing in the read may branch on how the caller signed in.
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia', lastName: 'Diaz' });
		await seedTask(db, { title: 'Phone task', userId: mia.id });

		const session = await invoke(getTasks, { ctx: ctx(), user: mia, path: '/api/tasks' });
		const token = await invoke(getTasks, {
			ctx: ctx(),
			user: mia,
			via: 'token',
			path: '/api/tasks'
		});

		expect(token.status).toBe(200);
		expect(token.body).toEqual(session.body);
	});
});

describe('POST /api/tasks', () => {
	beforeEach(truncateAll);

	it('creates a task with normalized tags, defaults and an auto-added category', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia', lastName: 'Diaz' });
		const family = await seedTaskFamily(db);
		await addMember(db, mia.id, family.id);

		const res = await invoke(postTask, {
			ctx: ctx(),
			user: mia,
			path: '/api/tasks',
			method: 'POST',
			body: {
				title: '  Buy milk  ',
				notes: ' 2 litres ',
				dueDate: '2026-02-01T10:00:00.000Z',
				recurrenceFrequency: 'weekly',
				recurrenceInterval: 2.7,
				tags: [' Shopping', 'milk', 'MILK', ' '],
				category: 'Errands',
				focusMinutes: 30,
				focusStartedAt: null
			}
		});

		expect(res.status).toBe(201);
		expect(res.body).toEqual({
			success: true,
			task: {
				id: expect.any(String),
				title: 'Buy milk',
				notes: ' 2 litres ',
				dueDate: '2026-02-01 10:00:00+00',
				completedAt: null,
				archivedAt: null,
				recurrenceFrequency: 'weekly',
				recurrenceInterval: 2,
				completionCount: 0,
				assignedTo: mia.id,
				assignmentStatus: 'accepted',
				priority: 'normal',
				visibility: 'public',
				userId: mia.id,
				familyId: family.id,
				eventId: null,
				focusMinutes: 30,
				focusStartedAt: null,
				category: 'Errands',
				createdAt: expect.stringMatching(ISO),
				tags: ['milk', 'shopping']
			}
		});
		const categories = await db
			.select()
			.from(taskCategories)
			.where(eq(taskCategories.userId, mia.id));
		expect(categories.map((row) => row.name)).toEqual(['Errands']);
	});

	it('reads an absent familyId as the caller`s family and an explicit null as personal', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const family = await seedTaskFamily(db);
		await addMember(db, mia.id, family.id);

		await invoke(postTask, {
			ctx: ctx(),
			user: mia,
			path: '/api/tasks',
			method: 'POST',
			body: { title: 'Family chore' }
		});
		await invoke(postTask, {
			ctx: ctx(),
			user: mia,
			path: '/api/tasks',
			method: 'POST',
			body: { title: 'Personal chore', familyId: null }
		});

		const rows = await db.select().from(tasks);
		const familyByTitle = new Map(rows.map((row) => [row.title, row.familyId]));
		expect(familyByTitle.get('Family chore')).toBe(family.id);
		expect(familyByTitle.get('Personal chore')).toBeNull();
	});

	it('defaults visibility to public', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });

		const ok = await invoke(postTask, {
			ctx: ctx(),
			user: mia,
			path: '/api/tasks',
			method: 'POST',
			body: { title: 'Public by default' }
		});
		expect(ok.status).toBe(201);
		expect(ok.body).toEqual({
			success: true,
			task: expect.objectContaining({ visibility: 'public', assignmentStatus: 'accepted' })
		});
	});

	const invalidVisibilities: { label: string; visibility: JsonValue }[] = [
		{ label: 'an explicit null', visibility: null },
		{ label: 'an unknown value', visibility: 'secret' }
	];
	it.each(invalidVisibilities)(
		'answers 400 Invalid visibility for $label',
		async ({ visibility }) => {
			const mia = await seedUser(testDb(), { firstName: 'Mia' });

			const res = await invoke(postTask, {
				ctx: ctx(),
				user: mia,
				path: '/api/tasks',
				method: 'POST',
				body: { title: 'Nope', visibility }
			});
			expect(res.status).toBe(400);
			expect(res.body).toEqual({ error: 'Invalid visibility' });
		}
	);

	it('falls back to normal for an unknown priority', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });

		const res = await invoke(postTask, {
			ctx: ctx(),
			user: mia,
			path: '/api/tasks',
			method: 'POST',
			body: { title: 'Urgent-ish', priority: 'urgent' }
		});

		expect(res.status).toBe(201);
		expect(res.body).toEqual({
			success: true,
			task: expect.objectContaining({ priority: 'normal' })
		});
	});

	it('assigning another family member starts a pending handoff and alerts them', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia', lastName: 'Diaz' });
		const sam = await seedUser(db, { firstName: 'Sam', lastName: 'Roy' });
		const family = await seedTaskFamily(db);
		await addMember(db, mia.id, family.id);
		await addMember(db, sam.id, family.id);

		const res = await invoke(postTask, {
			ctx: ctx(),
			user: mia,
			path: '/api/tasks',
			method: 'POST',
			body: { title: 'Plan trip', assignedTo: sam.id }
		});

		expect(res.status).toBe(201);
		expect(res.body).toEqual({
			success: true,
			task: expect.objectContaining({
				assignedTo: sam.id,
				assignmentStatus: 'pending',
				familyId: family.id
			})
		});
		const alerts = await db.select().from(notifications);
		expect(alerts).toEqual([
			expect.objectContaining({
				userId: sam.id,
				type: 'assignment_pending',
				actorName: 'Mia',
				message: "Mia assigned you 'Plan trip'",
				link: '/calendar/tasks',
				readAt: null
			})
		]);
	});

	it('rejects an assignee outside the family and a family the caller is not in', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const sam = await seedUser(db, { firstName: 'Sam' });
		const family = await seedTaskFamily(db);
		await addMember(db, mia.id, family.id);
		const otherFamily = await seedTaskFamily(db, 'Other');

		const notMember = await invoke(postTask, {
			ctx: ctx(),
			user: mia,
			path: '/api/tasks',
			method: 'POST',
			body: { title: 'X', assignedTo: sam.id }
		});
		expect(notMember.status).toBe(400);
		expect(notMember.body).toEqual({ error: 'Assignee is not a member of this family' });

		const notMyFamily = await invoke(postTask, {
			ctx: ctx(),
			user: mia,
			path: '/api/tasks',
			method: 'POST',
			body: { title: 'X', familyId: otherFamily.id }
		});
		expect(notMyFamily.status).toBe(403);
		expect(notMyFamily.body).toEqual({ error: 'Not a member of this family' });
	});

	const badCreateBodies: { label: string; body: JsonValue; error: string }[] = [
		{ label: 'a missing title', body: {}, error: 'Title is required' },
		{ label: 'a blank title', body: { title: '   ' }, error: 'Title is required' },
		{
			label: 'an unparseable dueDate',
			body: { title: 'X', dueDate: 'not-a-date' },
			error: 'Invalid dueDate'
		},
		{ label: 'a numeric dueDate', body: { title: 'X', dueDate: 7 }, error: 'Invalid dueDate' },
		{ label: 'a numeric eventId', body: { title: 'X', eventId: 7 }, error: 'Invalid eventId' }
	];
	it.each(badCreateBodies)('answers 400 $error for $label', async ({ body, error }) => {
		const mia = await seedUser(testDb(), { firstName: 'Mia' });

		const res = await invoke(postTask, {
			ctx: ctx(),
			user: mia,
			path: '/api/tasks',
			method: 'POST',
			body
		});
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error });
	});

	it('answers 400 Event not found and 403 No access for an unreadable event', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const sam = await seedUser(db, { firstName: 'Sam' });
		const event = await seedEvent(db, {
			ownerId: sam.id,
			title: 'Dentist',
			start: '2026-03-01T09:00:00.000Z'
		});

		const missing = await invoke(postTask, {
			ctx: ctx(),
			user: mia,
			path: '/api/tasks',
			method: 'POST',
			body: { title: 'X', eventId: 'no-such-event' }
		});
		expect(missing.status).toBe(400);
		expect(missing.body).toEqual({ error: 'Event not found' });

		const denied = await invoke(postTask, {
			ctx: ctx(),
			user: mia,
			path: '/api/tasks',
			method: 'POST',
			body: { title: 'X', eventId: event.id }
		});
		expect(denied.status).toBe(403);
		expect(denied.body).toEqual({ error: 'No access to this event' });
	});

	it('attaches a task to an event the caller can read through the family calendar', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const sam = await seedUser(db, { firstName: 'Sam' });
		const family = await seedTaskFamily(db);
		await addMember(db, mia.id, family.id);
		const calendar = await seedCalendar(db, { familyId: family.id });
		const event = await seedEvent(db, {
			ownerId: sam.id,
			calendarId: calendar.id,
			title: 'Dentist',
			start: '2026-03-01T09:00:00.000Z'
		});

		const res = await invoke(postTask, {
			ctx: ctx(),
			user: mia,
			path: '/api/tasks',
			method: 'POST',
			body: { title: 'Bring forms', eventId: event.id }
		});
		expect(res.status).toBe(201);
		expect(res.body).toEqual({
			success: true,
			task: expect.objectContaining({ eventId: event.id, familyId: family.id })
		});

		const listed = await invoke(getTasks, {
			ctx: ctx(),
			user: mia,
			path: '/api/tasks',
			query: { eventId: event.id }
		});
		expect(listed.body).toEqual({
			tasks: [expect.objectContaining({ title: 'Bring forms', eventCalendarId: calendar.id })]
		});
	});

	it('treats an empty-string dueDate and eventId as none', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });

		const res = await invoke(postTask, {
			ctx: ctx(),
			user: mia,
			path: '/api/tasks',
			method: 'POST',
			body: { title: 'Undated', dueDate: '', eventId: '' }
		});

		expect(res.status).toBe(201);
		expect(res.body).toEqual({
			success: true,
			task: expect.objectContaining({ dueDate: null, eventId: null })
		});
	});

	const badFocusBodies: { label: string; body: JsonValue; error: string }[] = [
		{ label: 'a negative focusMinutes', body: { title: 'X', focusMinutes: -1 }, error: 'Invalid focusMinutes' },
		{ label: 'a fractional focusMinutes', body: { title: 'X', focusMinutes: 1.5 }, error: 'Invalid focusMinutes' },
		{ label: 'a string focusMinutes', body: { title: 'X', focusMinutes: '30' }, error: 'Invalid focusMinutes' },
		{
			label: 'an unparseable focusStartedAt',
			body: { title: 'X', focusStartedAt: 'not-a-date' },
			error: 'Invalid focusStartedAt'
		},
		{
			label: 'a numeric focusStartedAt',
			body: { title: 'X', focusStartedAt: 42 },
			error: 'Invalid focusStartedAt'
		}
	];
	it.each(badFocusBodies)('answers 400 $error for $label, writing nothing', async ({ body, error }) => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });

		const res = await invoke(postTask, {
			ctx: ctx(),
			user: mia,
			path: '/api/tasks',
			method: 'POST',
			body
		});
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error });
		expect(await db.select().from(tasks)).toEqual([]);
	});

	it('silently nulls an unknown recurrenceFrequency and floors the interval to at least 1', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });

		const unknown = await invoke(postTask, {
			ctx: ctx(),
			user: mia,
			path: '/api/tasks',
			method: 'POST',
			body: { title: 'Hourly', recurrenceFrequency: 'hourly', recurrenceInterval: 3 }
		});
		expect(unknown.body).toEqual({
			success: true,
			task: expect.objectContaining({ recurrenceFrequency: null, recurrenceInterval: null })
		});

		const floored = await invoke(postTask, {
			ctx: ctx(),
			user: mia,
			path: '/api/tasks',
			method: 'POST',
			body: { title: 'Daily', recurrenceFrequency: 'daily', recurrenceInterval: 0 }
		});
		expect(floored.body).toEqual({
			success: true,
			task: expect.objectContaining({ recurrenceFrequency: 'daily', recurrenceInterval: 1 })
		});
	});

	const badCategoryBodies: { label: string; body: JsonValue; error: string }[] = [
		{ label: 'a numeric category', body: { title: 'X', category: 7 }, error: 'category must be a string' },
		{
			label: 'an over-long category',
			body: { title: 'X', category: 'x'.repeat(81) },
			error: 'category is too long'
		}
	];
	it.each(badCategoryBodies)('answers 400 $error for $label', async ({ body, error }) => {
		const mia = await seedUser(testDb(), { firstName: 'Mia' });

		const res = await invoke(postTask, {
			ctx: ctx(),
			user: mia,
			path: '/api/tasks',
			method: 'POST',
			body
		});
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error });
	});

	it('stores a case variant in the list`s spelling and a blank category as null', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		await seedTaskCategory(db, mia.id, 'Work');

		const res = await invoke(postTask, {
			ctx: ctx(),
			user: mia,
			path: '/api/tasks',
			method: 'POST',
			body: { title: 'Taxes', category: 'work' }
		});
		expect(res.status).toBe(201);
		expect(res.body).toEqual({ success: true, task: expect.objectContaining({ category: 'Work' }) });
		expect((await db.select().from(taskCategories)).map((row) => row.name)).toEqual(['Work']);

		const blank = await invoke(postTask, {
			ctx: ctx(),
			user: mia,
			path: '/api/tasks',
			method: 'POST',
			body: { title: 'Blank', category: '   ' }
		});
		expect(blank.body).toEqual({ success: true, task: expect.objectContaining({ category: null }) });
	});
});

describe('GET /api/tasks/sections', () => {
	beforeEach(truncateAll);

	it('returns the three queues as whole rows, without the list-only fields', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia', lastName: 'Diaz' });
		const sam = await seedUser(db, { firstName: 'Sam', lastName: 'Roy' });
		const family = await seedTaskFamily(db);
		await addMember(db, mia.id, family.id);
		await addMember(db, sam.id, family.id);
		const event = await seedEvent(db, {
			ownerId: sam.id,
			title: 'Dentist',
			start: '2026-03-01T09:00:00.000Z'
		});
		const mine = await seedTask(db, {
			title: 'Mine',
			eventId: event.id,
			createdAt: new Date('2026-01-02T00:00:00.000Z'),
			userId: mia.id
		});
		const accepted = await seedTask(db, {
			title: 'Assigned to me',
			assignedTo: mia.id,
			assignmentStatus: 'accepted',
			familyId: family.id,
			createdAt: new Date('2026-01-03T00:00:00.000Z'),
			userId: sam.id
		});
		const pending = await seedTask(db, {
			title: 'Please accept',
			assignedTo: mia.id,
			assignmentStatus: 'pending',
			familyId: family.id,
			createdAt: new Date('2026-01-04T00:00:00.000Z'),
			userId: sam.id
		});
		const requested = await seedTask(db, {
			title: 'Asked of Sam',
			assignedTo: sam.id,
			assignmentStatus: 'pending',
			familyId: family.id,
			createdAt: new Date('2026-01-05T00:00:00.000Z'),
			userId: mia.id
		});
		// A stale recurring row: the hidden getUserFamilyId/getTasksForUser leg
		// inside loadTaskSections (tasksData.ts:37) pins it BEFORE the section
		// reads, so the row myTasks returns already carries today-end.
		const stale = await seedTask(db, {
			title: 'Water plants',
			dueDate: '2020-01-01T00:00:00.000Z',
			recurrenceFrequency: 'daily',
			recurrenceInterval: 1,
			createdAt: new Date('2026-01-01T00:00:00.000Z'),
			userId: mia.id
		});
		// An open phone session would show up in the LIST shape; the section
		// shape never carries the phone overlay.
		await seedTaskFocusSession(db, {
			userId: mia.id,
			taskId: mine.id,
			startedAt: new Date('2026-12-01T09:00:00.000Z')
		});
		const todayEnd = utcToday().set({ hour: 23, minute: 59, second: 0, millisecond: 0 });

		const res = await invoke(getSections, { ctx: ctx(), user: mia, path: '/api/tasks/sections' });

		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			myTasks: [
				{
					id: accepted.id,
					title: 'Assigned to me',
					notes: null,
					dueDate: null,
					completedAt: null,
					archivedAt: null,
					recurrenceFrequency: null,
					recurrenceInterval: null,
					completionCount: 0,
					assignedTo: mia.id,
					assignmentStatus: 'accepted',
					priority: 'normal',
					visibility: 'public',
					focusMinutes: null,
					focusStartedAt: null,
					category: null,
					assigneeFirstName: 'Mia',
					assigneeLastName: 'Diaz',
					userId: sam.id,
					familyId: family.id,
					eventId: null,
					createdAt: '2026-01-03T00:00:00.000Z',
					eventTitle: null,
					eventStart: null,
					creatorFirstName: 'Sam',
					tags: []
				},
				{
					id: mine.id,
					title: 'Mine',
					notes: null,
					dueDate: null,
					completedAt: null,
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
					userId: mia.id,
					familyId: null,
					eventId: event.id,
					createdAt: '2026-01-02T00:00:00.000Z',
					eventTitle: 'Dentist',
					eventStart: '2026-03-01 09:00:00+00',
					creatorFirstName: 'Mia',
					tags: []
				},
				{
					id: stale.id,
					title: 'Water plants',
					notes: null,
					dueDate: pgTime(todayEnd),
					completedAt: null,
					archivedAt: null,
					recurrenceFrequency: 'daily',
					recurrenceInterval: 1,
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
					userId: mia.id,
					familyId: null,
					eventId: null,
					createdAt: '2026-01-01T00:00:00.000Z',
					eventTitle: null,
					eventStart: null,
					creatorFirstName: 'Mia',
					tags: []
				}
			],
			pendingAssignments: [
				{
					id: pending.id,
					title: 'Please accept',
					notes: null,
					dueDate: null,
					completedAt: null,
					archivedAt: null,
					recurrenceFrequency: null,
					recurrenceInterval: null,
					completionCount: 0,
					assignedTo: mia.id,
					assignmentStatus: 'pending',
					priority: 'normal',
					visibility: 'public',
					focusMinutes: null,
					focusStartedAt: null,
					category: null,
					assigneeFirstName: 'Mia',
					assigneeLastName: 'Diaz',
					userId: sam.id,
					familyId: family.id,
					eventId: null,
					createdAt: '2026-01-04T00:00:00.000Z',
					eventTitle: null,
					eventStart: null,
					creatorFirstName: 'Sam',
					tags: []
				}
			],
			requestedByMe: [
				{
					id: requested.id,
					title: 'Asked of Sam',
					notes: null,
					dueDate: null,
					completedAt: null,
					archivedAt: null,
					recurrenceFrequency: null,
					recurrenceInterval: null,
					completionCount: 0,
					assignedTo: sam.id,
					assignmentStatus: 'pending',
					priority: 'normal',
					visibility: 'public',
					focusMinutes: null,
					focusStartedAt: null,
					category: null,
					assigneeFirstName: 'Sam',
					assigneeLastName: 'Roy',
					userId: mia.id,
					familyId: family.id,
					eventId: null,
					createdAt: '2026-01-05T00:00:00.000Z',
					eventTitle: null,
					eventStart: null,
					creatorFirstName: 'Mia',
					tags: []
				}
			],
			warnings: []
		});
	});

	it('drops archived rows from every section', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		await seedTask(db, {
			title: 'Archived of mine',
			archivedAt: '2026-01-01T00:00:00.000Z',
			userId: mia.id
		});

		const res = await invoke(getSections, { ctx: ctx(), user: mia, path: '/api/tasks/sections' });

		expect(res.body).toEqual({
			myTasks: [],
			pendingAssignments: [],
			requestedByMe: [],
			warnings: []
		});
	});
});

describe('DELETE /api/tasks/completed', () => {
	beforeEach(truncateAll);

	it('archives only the caller`s completed rows and keeps every other row', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const sam = await seedUser(db, { firstName: 'Sam' });
		const completed = await seedTask(db, {
			title: 'Done of mine',
			completedAt: '2026-01-01T00:00:00.000Z',
			createdAt: new Date('2026-01-01T00:00:00.000Z'),
			userId: mia.id
		});
		const open = await seedTask(db, {
			title: 'Still open',
			createdAt: new Date('2026-01-02T00:00:00.000Z'),
			userId: mia.id
		});
		const assigned = await seedTask(db, {
			title: 'Done, assigned to me',
			completedAt: '2026-01-02T00:00:00.000Z',
			assignedTo: mia.id,
			assignmentStatus: 'accepted',
			createdAt: new Date('2026-01-03T00:00:00.000Z'),
			userId: sam.id
		});

		const res = await invoke(clearCompleted, {
			ctx: ctx(),
			user: mia,
			path: '/api/tasks/completed',
			method: 'DELETE'
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true });
		const rows = await db.select().from(tasks);
		const archived = new Map(rows.map((row) => [row.id, row.archivedAt]));
		expect(archived.get(completed.id)).not.toBeNull();
		expect(archived.get(open.id)).toBeNull();
		// TODAY's wire: the clear only archives rows the caller OWNS, so a
		// completed accepted assignment stays in the caller's list.
		expect(archived.get(assigned.id)).toBeNull();

		const sections = await invoke(getSections, {
			ctx: ctx(),
			user: mia,
			path: '/api/tasks/sections'
		});
		// Legacy getMyTasks is the OR of the caller's personal rows and their
		// accepted assignments, so the untouched open row is still listed.
		expect(sections.body).toEqual({
			myTasks: [
				expect.objectContaining({ id: assigned.id }),
				expect.objectContaining({ id: open.id })
			],
			pendingAssignments: [],
			requestedByMe: [],
			warnings: []
		});
	});
});

describe('GET /api/stats', () => {
	beforeEach(truncateAll);

	it('returns the empty snapshot for a user with no completions and no family', async () => {
		const mia = await seedUser(testDb(), { firstName: 'Mia' });

		const res = await invoke(getStats, { ctx: ctx(), user: mia, path: '/api/stats' });

		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			stats: {
				completedOnce: 0,
				recurringTasks: 0,
				recurringCompletions: 0,
				topAssigners: [],
				topAssignees: [],
				recentlyCompleted: [],
				month: { completed: 0, recurring: 0 },
				doneBy: []
			},
			streak: {
				current: 0,
				best: 0,
				freezeUsedInCurrentGap: false,
				lastCompletedWeek: null
			},
			completionIso: [],
			todayIso: expect.stringMatching(ISO),
			month: { completed: 0, recurring: 0 },
			doneBy: [],
			roster: []
		});
	});

	it('counts completions by actor with the legacy owner fallback (#092/#146)', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia', lastName: 'Diaz' });
		const sam = await seedUser(db, { firstName: 'Sam', lastName: 'Roy' });
		const family = await seedTaskFamily(db);
		await addMember(db, mia.id, family.id);
		await addMember(db, sam.id, family.id, 'member', 'child');
		const first = await seedTask(db, {
			title: 'First',
			completedAt: '2026-01-01T00:00:00.000Z',
			userId: mia.id
		});
		const recurring = await seedTask(db, {
			title: 'Recurring',
			recurrenceFrequency: 'daily',
			recurrenceInterval: 1,
			completionCount: 1,
			userId: mia.id
		});
		const legacy = await seedTask(db, { title: 'Legacy', userId: mia.id });
		const bySam = await seedTask(db, {
			title: 'Done by Sam',
			completedAt: '2026-01-02T00:00:00.000Z',
			userId: mia.id
		});
		await seedTaskCompletion(db, {
			taskId: first.id,
			userId: mia.id,
			actorId: mia.id,
			familyId: family.id
		});
		await seedTaskCompletion(db, {
			taskId: recurring.id,
			userId: mia.id,
			actorId: mia.id,
			familyId: family.id
		});
		await seedTaskCompletion(db, { taskId: legacy.id, userId: mia.id, actorId: null, familyId: null });
		await seedTaskCompletion(db, {
			taskId: bySam.id,
			userId: mia.id,
			actorId: sam.id,
			familyId: family.id
		});

		const res = await invoke(getStats, { ctx: ctx(), user: mia, path: '/api/stats' });

		expect(res.status).toBe(200);
		expect(res.body).toMatchObject({
			stats: {
				completedOnce: 3,
				recurringTasks: 1,
				recurringCompletions: 1,
				month: { completed: 3, recurring: 1 },
				doneBy: [
					{ name: 'Mia', count: 2 },
					{ name: 'Sam', count: 1 }
				],
				recentlyCompleted: expect.arrayContaining([
					{ title: 'First', completedAt: expect.stringMatching(ISO), recurring: false },
					{ title: 'Recurring', completedAt: expect.stringMatching(ISO), recurring: true },
					{ title: 'Legacy', completedAt: expect.stringMatching(ISO), recurring: false }
				])
			},
			streak: {
				current: 1,
				best: 1,
				freezeUsedInCurrentGap: false,
				lastCompletedWeek: expect.stringMatching(/^\d{4}-W\d{2}$/)
			},
			completionIso: expect.arrayContaining([expect.stringMatching(ISO)]),
			todayIso: expect.stringMatching(ISO),
			roster: expect.arrayContaining([
				expect.objectContaining({ firstName: 'Mia' }),
				expect.objectContaining({ firstName: 'Sam', memberType: 'child' })
			])
		});
	});

	it('ranks assigners/assignees, keeps ten recent and every completion instant', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia', lastName: 'Diaz' });
		// users.lastName is NOT NULL, so the realistic edge is an empty last name: `first || ' ' || last` keeps the trailing space.
		const sam = await seedUser(db, { firstName: 'Sam', lastName: '' });
		const lee = await seedUser(db, { firstName: 'Lee', lastName: 'Kai' });

		// Top assigners: what OTHER people gave Mia (userId <> Mia).
		await seedTask(db, { title: 'From Sam 1', assignedTo: mia.id, userId: sam.id });
		await seedTask(db, { title: 'From Sam 2', assignedTo: mia.id, userId: sam.id });
		await seedTask(db, { title: 'From Lee', assignedTo: mia.id, userId: lee.id });
		// Top assignees: what Mia gave others (assignedTo <> Mia).
		await seedTask(db, { title: 'To Lee 1', assignedTo: lee.id, userId: mia.id });
		await seedTask(db, { title: 'To Lee 2', assignedTo: lee.id, userId: mia.id });
		await seedTask(db, { title: 'To Sam', assignedTo: sam.id, userId: mia.id });

		// Eleven check-offs in ONE ISO week (2026-W37), explicit instants, so the
		// recent list has to drop the oldest and the streak has one week.
		const instants = Array.from({ length: 11 }, (_, index) =>
			new Date(Date.UTC(2026, 8, 7, index, 0, 0)).toISOString()
		);
		for (const [index, completedAt] of instants.entries()) {
			const task = await seedTask(db, {
				title: `Done ${String(index + 1).padStart(2, '0')}`,
				userId: mia.id
			});
			await seedTaskCompletion(db, {
				taskId: task.id,
				userId: mia.id,
				actorId: mia.id,
				completedAt
			});
		}

		const res = await invoke(getStats, { ctx: ctx(), user: mia, path: '/api/stats' });

		expect(res.status).toBe(200);
		const body = jsonObject(res.body);
		expect(body.stats).toEqual({
			completedOnce: 11,
			recurringTasks: 0,
			recurringCompletions: 0,
			topAssigners: [
				{ name: 'Sam ', total: 2 },
				{ name: 'Lee Kai', total: 1 }
			],
			topAssignees: [
				{ name: 'Lee Kai', total: 2 },
				{ name: 'Sam ', total: 1 }
			],
			recentlyCompleted: instants
				.slice()
				.reverse()
				.slice(0, 10)
				.map((completedAt, index) => ({
					title: `Done ${String(11 - index).padStart(2, '0')}`,
					completedAt,
					recurring: false
				})),
			month: { completed: 0, recurring: 0 },
			doneBy: [{ name: 'Mia', count: 11 }]
		});
		expect(body.streak).toEqual({
			current: 0,
			best: 1,
			freezeUsedInCurrentGap: false,
			lastCompletedWeek: '2026-W37'
		});
		expect(body.completionIso).toEqual(instants.slice().reverse());
		expect(body.todayIso).toEqual(expect.stringMatching(ISO));
		expect(body.month).toEqual({ completed: 0, recurring: 0 });
		expect(body.doneBy).toEqual([{ name: 'Mia', count: 11 }]);
		expect(body.roster).toEqual([]);
	});
});

describe('task categories', () => {
	beforeEach(truncateAll);

	it('lists the caller`s categories name-sorted case-insensitively', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const other = await seedUser(db, { firstName: 'Other' });
		const zebra = await seedTaskCategory(db, mia.id, 'zebra');
		const home = await seedTaskCategory(db, mia.id, 'home');
		const work = await seedTaskCategory(db, mia.id, 'Work');
		await seedTaskCategory(db, other.id, 'apple');

		const res = await invoke(getCategories, { ctx: ctx(), user: mia, path: '/api/task-categories' });

		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			categories: [
				{
					id: home.id,
					name: 'home',
					createdAt: expect.stringMatching(ISO),
					updatedAt: expect.stringMatching(ISO)
				},
				{
					id: work.id,
					name: 'Work',
					createdAt: expect.stringMatching(ISO),
					updatedAt: expect.stringMatching(ISO)
				},
				{
					id: zebra.id,
					name: 'zebra',
					createdAt: expect.stringMatching(ISO),
					updatedAt: expect.stringMatching(ISO)
				}
			]
		});
	});

	it('adds a category idempotently, reusing the stored spelling for any case', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const existing = await seedTaskCategory(db, mia.id, 'Work');

		const created = await invoke(postCategory, {
			ctx: ctx(),
			user: mia,
			path: '/api/task-categories',
			method: 'POST',
			body: { name: '  Deep Work  ' }
		});
		expect(created.status).toBe(200);
		expect(created.body).toEqual({
			category: {
				id: expect.any(String),
				name: 'Deep Work',
				createdAt: expect.stringMatching(ISO),
				updatedAt: expect.stringMatching(ISO)
			}
		});

		const again = await invoke(postCategory, {
			ctx: ctx(),
			user: mia,
			path: '/api/task-categories',
			method: 'POST',
			body: { name: 'work' }
		});
		expect(again.status).toBe(200);
		expect(again.body).toEqual({
			category: {
				id: existing.id,
				name: 'Work',
				createdAt: expect.stringMatching(ISO),
				updatedAt: expect.stringMatching(ISO)
			}
		});
		expect(await db.select().from(taskCategories)).toHaveLength(2);
	});

	const badCategoryNames: { label: string; name?: string | number; error: string }[] = [
		{ label: 'a missing name', error: 'name is required' },
		{ label: 'a blank name', name: '   ', error: 'name is required' },
		{ label: 'a numeric name', name: 7, error: 'name is required' },
		{ label: 'an over-long name', name: 'x'.repeat(81), error: 'name is too long' }
	];
	it.each(badCategoryNames)('answers 400 $error for $label', async ({ name, error }) => {
		const mia = await seedUser(testDb(), { firstName: 'Mia' });

		const res = await invoke(postCategory, {
			ctx: ctx(),
			user: mia,
			path: '/api/task-categories',
			method: 'POST',
			body: name === undefined ? {} : { name }
		});
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error });
	});

	it('answers 400 name is required for malformed JSON', async () => {
		const mia = await seedUser(testDb(), { firstName: 'Mia' });

		const malformed = await invoke(postCategory, {
			ctx: ctx(),
			user: mia,
			path: '/api/task-categories',
			method: 'POST',
			rawBody: '{'
		});
		expect(malformed.status).toBe(400);
		expect(malformed.body).toEqual({ error: 'name is required' });
	});

	it('renames the caller`s owned and assigned tasks, not another user`s', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const sam = await seedUser(db, { firstName: 'Sam' });
		const category = await seedTaskCategory(db, mia.id, 'Work');
		const owned = await seedTask(db, { title: 'Owned', category: 'work', userId: mia.id });
		const assigned = await seedTask(db, {
			title: 'Assigned',
			category: 'WORK',
			assignedTo: mia.id,
			assignmentStatus: 'accepted',
			userId: sam.id
		});
		const foreign = await seedTask(db, { title: 'Foreign', category: 'Work', userId: sam.id });

		const res = await invoke(patchCategory, {
			ctx: ctx(),
			user: mia,
			params: { id: category.id },
			method: 'PATCH',
			body: { name: 'Deep Work' }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			category: {
				id: category.id,
				name: 'Deep Work',
				createdAt: expect.stringMatching(ISO),
				updatedAt: expect.stringMatching(ISO)
			}
		});
		const rows = await db.select().from(tasks);
		const byId = new Map(rows.map((row) => [row.id, row.category]));
		expect(byId.get(owned.id)).toBe('Deep Work');
		expect(byId.get(assigned.id)).toBe('Deep Work');
		expect(byId.get(foreign.id)).toBe('Work');
	});

	it('allows a case-only rename and 409s when another category owns the name', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const category = await seedTaskCategory(db, mia.id, 'Work');
		await seedTaskCategory(db, mia.id, 'Home');

		const caseOnly = await invoke(patchCategory, {
			ctx: ctx(),
			user: mia,
			params: { id: category.id },
			method: 'PATCH',
			body: { name: 'WORK' }
		});
		expect(caseOnly.status).toBe(200);
		expect(caseOnly.body).toEqual({ category: expect.objectContaining({ name: 'WORK' }) });

		const clash = await invoke(patchCategory, {
			ctx: ctx(),
			user: mia,
			params: { id: category.id },
			method: 'PATCH',
			body: { name: 'home' }
		});
		expect(clash.status).toBe(409);
		expect(clash.body).toEqual({ error: 'A category with that name already exists' });
	});

	it('answers 404 for an unknown or another user`s category, 400 for a bad name', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const sam = await seedUser(db, { firstName: 'Sam' });
		const sams = await seedTaskCategory(db, sam.id, 'Sam`s');

		const unknown = await invoke(patchCategory, {
			ctx: ctx(),
			user: mia,
			params: { id: 'no-such-category' },
			method: 'PATCH',
			body: { name: 'Work' }
		});
		expect(unknown.status).toBe(404);
		expect(unknown.body).toEqual({ error: 'Category not found' });

		const foreign = await invoke(deleteCategory, {
			ctx: ctx(),
			user: mia,
			params: { id: sams.id },
			method: 'DELETE'
		});
		expect(foreign.status).toBe(404);
		expect(foreign.body).toEqual({ error: 'Category not found' });
		expect(await db.select().from(taskCategories)).toHaveLength(1);

		const unknownDelete = await invoke(deleteCategory, {
			ctx: ctx(),
			user: mia,
			params: { id: 'no-such-category' },
			method: 'DELETE'
		});
		expect(unknownDelete.status).toBe(404);
		expect(unknownDelete.body).toEqual({ error: 'Category not found' });
	});

	const badRenameNames: { label: string; name?: string; error: string }[] = [
		{ label: 'a missing name', error: 'name is required' },
		{ label: 'an empty name', name: '', error: 'name is required' },
		{ label: 'an over-long name', name: 'x'.repeat(81), error: 'name is too long' }
	];
	it.each(badRenameNames)('answers 400 $error for $label on PATCH', async ({ name, error }) => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const sam = await seedUser(db, { firstName: 'Sam' });
		const sams = await seedTaskCategory(db, sam.id, 'Sam`s');

		const res = await invoke(patchCategory, {
			ctx: ctx(),
			user: mia,
			params: { id: sams.id },
			method: 'PATCH',
			body: name === undefined ? {} : { name }
		});
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error });
	});

	it('deletes a category and clears it from the caller`s owned and assigned tasks', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const sam = await seedUser(db, { firstName: 'Sam' });
		const category = await seedTaskCategory(db, mia.id, 'Work');
		const owned = await seedTask(db, { title: 'Owned', category: 'Work', userId: mia.id });
		const foreign = await seedTask(db, { title: 'Foreign', category: 'Work', userId: sam.id });

		const res = await invoke(deleteCategory, {
			ctx: ctx(),
			user: mia,
			params: { id: category.id },
			method: 'DELETE'
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true });
		expect(await db.select().from(taskCategories)).toEqual([]);
		const rows = await db.select().from(tasks);
		const byId = new Map(rows.map((row) => [row.id, row.category]));
		expect(byId.get(owned.id)).toBeNull();
		expect(byId.get(foreign.id)).toBe('Work');
	});
});

describe('signed out', () => {
	beforeEach(truncateAll);

	const calls: {
		label: string;
		call: () => Promise<{ status: number; body: JsonValue | null }>;
	}[] = [
		{ label: 'GET /api/tasks', call: () => invoke(getTasks, { ctx: ctx(), path: '/api/tasks' }) },
		{
			label: 'POST /api/tasks',
			call: () =>
				invoke(postTask, { ctx: ctx(), path: '/api/tasks', method: 'POST', body: { title: 'X' } })
		},
		{
			label: 'GET /api/tasks/sections',
			call: () => invoke(getSections, { ctx: ctx(), path: '/api/tasks/sections' })
		},
		{
			label: 'DELETE /api/tasks/completed',
			call: () =>
				invoke(clearCompleted, { ctx: ctx(), path: '/api/tasks/completed', method: 'DELETE' })
		},
		{ label: 'GET /api/stats', call: () => invoke(getStats, { ctx: ctx(), path: '/api/stats' }) },
		{
			label: 'GET /api/task-categories',
			call: () => invoke(getCategories, { ctx: ctx(), path: '/api/task-categories' })
		},
		{
			label: 'POST /api/task-categories',
			call: () =>
				invoke(postCategory, {
					ctx: ctx(),
					path: '/api/task-categories',
					method: 'POST',
					body: { name: 'Work' }
				})
		},
		{
			label: 'PATCH /api/task-categories/[id]',
			call: () =>
				invoke(patchCategory, {
					ctx: ctx(),
					params: { id: 'x' },
					method: 'PATCH',
					body: { name: 'Work' }
				})
		},
		{
			label: 'DELETE /api/task-categories/[id]',
			call: () => invoke(deleteCategory, { ctx: ctx(), params: { id: 'x' }, method: 'DELETE' })
		}
	];
	it.each(calls)('answers 401 {"error":"Unauthorized"} on $label', async ({ call }) => {
		const res = await call();
		expect(res.status).toBe(401);
		expect(res.body).toEqual({ error: 'Unauthorized' });
	});
});
