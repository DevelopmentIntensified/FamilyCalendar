/**
 * The tasks repo against real Postgres: every query that filters, orders,
 * joins, guards or batches. Each test runs in `rollbackTest`, so its rows
 * vanish afterwards, and every write is given its `now` so the assertions can
 * name the stamped values.
 *
 * Row builders are this module's fixtures (plus kernel `seedUser`); the parent
 * Event row is written here with the given `db`, because calendar's fixtures
 * bind their own connection and would not be visible inside the rollback.
 *
 * Doc: ./README.md#how-to-test
 */
import { describe, expect } from 'vitest';
import { events, taskCompletions, tasks } from '$lib/kernel/db/tables.server';
import type { Db } from '$lib/kernel/db/database.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { addMember, seedTask, seedTaskCompletion, seedTaskFamily, seedTaskTags } from './tasks.fixtures.server';
import {
	advanceCursorGuarded,
	archiveOwnedCompletedTasks,
	archiveTaskById,
	deleteCompletionById,
	deleteTaskById,
	findLatestCompletion,
	findOwnedTask,
	findTask,
	insertCompletion,
	insertTask,
	insertTaskTags,
	listFamilyTaskRows,
	listMyTasks,
	listPendingAssignments,
	listPinnableTasks,
	listPublicFamilyTasks,
	listRequestedByMe,
	listTagsForTasks,
	listTasksForEvent,
	listTasksForUser,
	pinDueDates,
	replaceTaskTags,
	rewindCursorGuarded,
	skipCursor,
	updateTaskById,
	updateTaskInFamily
} from './tasks.repo.server';

/** One Event row; the parent Event is calendar's row, not this module's. */
async function seedEvent(db: Db, values: typeof events.$inferInsert) {
	const [row] = await db.insert(events).values(values).returning();
	return row;
}

const CREATED = new Date('2026-01-02T00:00:00.000Z');

describe('task rows', () => {
	rollbackTest('insertTask stores the row and findTask reads it back', async (db) => {
		const mia = await seedUser(db, { firstName: 'Mia' });
		const row = await insertTask(db, {
			title: 'Buy milk',
			userId: mia.id,
			createdAt: CREATED
		});
		expect(row.title).toBe('Buy milk');
		expect(row.createdAt).toEqual(CREATED);
		expect(row.assignmentStatus).toBe('none');
		expect(row.priority).toBe('normal');
		expect(row.visibility).toBe('public');
		expect(row.completionCount).toBe(0);

		const found = await findTask(db, row.id);
		expect(found?.id).toBe(row.id);
		expect(await findTask(db, 'no-such-task')).toBeNull();
	});

	rollbackTest('findOwnedTask scopes to the owner', async (db) => {
		const mia = await seedUser(db);
		const sam = await seedUser(db);
		const row = await seedTask(db, { title: 'Mia`s', userId: mia.id });
		expect((await findOwnedTask(db, row.id, mia.id))?.id).toBe(row.id);
		expect(await findOwnedTask(db, row.id, sam.id)).toBeNull();
	});

	rollbackTest('updateTaskById rewrites only the fields it is given', async (db) => {
		const mia = await seedUser(db);
		const row = await seedTask(db, {
			title: 'Old',
			notes: 'keep me',
			priority: 'low',
			userId: mia.id
		});
		const updated = await updateTaskById(db, row.id, { title: 'New', dueDate: '2026-03-01T10:00:00.000Z' });
		expect(updated).toMatchObject({ title: 'New', notes: 'keep me', priority: 'low' });
		// A `mode:'string'` timestamptz reads back as Postgres text, not ISO.
		expect(updated?.dueDate).toBe('2026-03-01 10:00:00+00');
	});

	rollbackTest('updateTaskInFamily scopes by the STORED family', async (db) => {
		const mia = await seedUser(db);
		const family = await seedTaskFamily(db);
		const personal = await seedTask(db, { title: 'Personal', familyId: null, userId: mia.id });
		const familyTask = await seedTask(db, { title: 'Family', familyId: family.id, userId: mia.id });

		expect(await updateTaskInFamily(db, personal.id, family.id, { title: 'Missed' })).toBeNull();
		expect((await updateTaskInFamily(db, personal.id, null, { title: 'Mine' }))?.title).toBe('Mine');
		expect(
			(await updateTaskInFamily(db, familyTask.id, family.id, { title: 'Ours' }))?.title
		).toBe('Ours');
	});

	rollbackTest('deleteTaskById removes the row and reports it', async (db) => {
		const mia = await seedUser(db);
		const row = await seedTask(db, { title: 'Open', userId: mia.id });
		expect(await deleteTaskById(db, row.id)).toBe(true);
		expect(await findTask(db, row.id)).toBeNull();
		expect(await deleteTaskById(db, row.id)).toBe(false);
	});

	rollbackTest('archiveTaskById stamps archivedAt and keeps the row', async (db) => {
		const mia = await seedUser(db);
		const row = await seedTask(db, { title: 'Done', completedAt: '2026-01-01T00:00:00Z', userId: mia.id });
		const archived = await archiveTaskById(db, row.id, '2026-02-01T00:00:00.000Z');
		expect(archived?.archivedAt).toBe('2026-02-01 00:00:00+00');
		expect(await findTask(db, row.id)).not.toBeNull();
	});

	rollbackTest(
		'archiveOwnedCompletedTasks archives only the caller`s completed, unarchived rows',
		async (db) => {
			const mia = await seedUser(db);
			const sam = await seedUser(db);
			const completed = await seedTask(db, {
				title: 'Mine done',
				completedAt: '2026-01-01T00:00:00Z',
				userId: mia.id
			});
			const open = await seedTask(db, { title: 'Mine open', userId: mia.id });
			const already = await seedTask(db, {
				title: 'Already archived',
				completedAt: '2026-01-01T00:00:00Z',
				archivedAt: '2026-01-02T00:00:00Z',
				userId: mia.id
			});
			const theirs = await seedTask(db, {
				title: 'Their done',
				completedAt: '2026-01-01T00:00:00Z',
				userId: sam.id
			});

			expect(await archiveOwnedCompletedTasks(db, mia.id, '2026-03-01T00:00:00.000Z')).toBe(1);
			expect((await findTask(db, completed.id))?.archivedAt).toBe('2026-03-01 00:00:00+00');
			expect((await findTask(db, open.id))?.archivedAt).toBeNull();
			expect((await findTask(db, already.id))?.archivedAt).toBe('2026-01-02 00:00:00+00');
			expect((await findTask(db, theirs.id))?.archivedAt).toBeNull();
		}
	);
});

describe('list reads', () => {
	rollbackTest(
		'listTasksForUser reads own + family rows, newest first, archived dropped, with the Event',
		async (db) => {
			const mia = await seedUser(db);
			const sam = await seedUser(db);
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
				createdAt: new Date('2026-01-01T00:00:00Z'),
				userId: mia.id
			});
			const samsPrivate = await seedTask(db, {
				title: 'Sam`s private',
				visibility: 'private',
				familyId: family.id,
				createdAt: new Date('2026-01-03T00:00:00Z'),
				userId: sam.id
			});
			await seedTask(db, {
				title: 'Sam`s personal',
				familyId: null,
				createdAt: new Date('2026-01-04T00:00:00Z'),
				userId: sam.id
			});
			await seedTask(db, {
				title: 'Archived',
				archivedAt: '2026-01-05T00:00:00Z',
				createdAt: new Date('2026-01-05T00:00:00Z'),
				userId: mia.id
			});

			const rows = await listTasksForUser(db, { userId: mia.id, familyId: family.id });
			expect(rows.map((row) => row.title)).toEqual(['Sam`s private', 'Mine']);
			expect(rows.map((row) => row.id)).toEqual([samsPrivate.id, mine.id]);
			expect(rows[1]).toMatchObject({
				eventTitle: 'Dentist',
				eventStart: '2026-03-01 09:00:00+00',
				eventCalendarId: null
			});
		}
	);

	rollbackTest('listTasksForEvent reads the raw rows oldest first, archived dropped', async (db) => {
		const mia = await seedUser(db);
		const event = await seedEvent(db, { ownerId: mia.id, title: 'Trip', start: '2026-03-01T09:00:00Z' });
		const older = await seedTask(db, {
			title: 'Older',
			eventId: event.id,
			createdAt: new Date('2026-01-01T00:00:00Z'),
			userId: mia.id
		});
		const newer = await seedTask(db, {
			title: 'Newer',
			eventId: event.id,
			createdAt: new Date('2026-01-02T00:00:00Z'),
			userId: mia.id
		});
		await seedTask(db, {
			title: 'Archived',
			eventId: event.id,
			archivedAt: '2026-01-03T00:00:00Z',
			userId: mia.id
		});
		await seedTask(db, { title: 'Other event', userId: mia.id });

		const rows = await listTasksForEvent(db, event.id);
		expect(rows.map((row) => row.id)).toEqual([older.id, newer.id]);
		// The raw row shape: no joined Event columns on this read.
		expect(rows[0]).not.toHaveProperty('eventTitle');
	});

	rollbackTest(
		'listMyTasks reads personal rows + accepted assignments, never pending or another`s personal row',
		async (db) => {
			const mia = await seedUser(db);
			const sam = await seedUser(db);
			const family = await seedTaskFamily(db);
			await addMember(db, mia.id, family.id);
			await addMember(db, sam.id, family.id);

			const personal = await seedTask(db, { title: 'Personal', familyId: null, userId: mia.id });
			const accepted = await seedTask(db, {
				title: 'Accepted',
				assignedTo: mia.id,
				assignmentStatus: 'accepted',
				familyId: family.id,
				userId: sam.id
			});
			await seedTask(db, {
				title: 'Pending',
				assignedTo: mia.id,
				assignmentStatus: 'pending',
				familyId: family.id,
				userId: sam.id
			});
			await seedTask(db, { title: 'Sam`s row', userId: sam.id });
			await seedTask(db, {
				title: 'Archived',
				archivedAt: '2026-01-01T00:00:00Z',
				userId: mia.id
			});
			// A family row Mia owns but nobody assigned her is NOT on my Tasks.
			await seedTask(db, { title: 'Family unassigned', familyId: family.id, userId: mia.id });

			const rows = await listMyTasks(db, mia.id);
			expect(rows.map((row) => row.id).sort()).toEqual([personal.id, accepted.id].sort());
		}
	);

	rollbackTest('listPendingAssignments reads only pending handoffs to the caller', async (db) => {
		const mia = await seedUser(db);
		const sam = await seedUser(db);
		const pending = await seedTask(db, {
			title: 'Please accept',
			assignedTo: mia.id,
			assignmentStatus: 'pending',
			userId: sam.id
		});
		await seedTask(db, {
			title: 'Accepted',
			assignedTo: mia.id,
			assignmentStatus: 'accepted',
			userId: sam.id
		});
		const rows = await listPendingAssignments(db, mia.id);
		expect(rows.map((row) => row.id)).toEqual([pending.id]);
	});

	rollbackTest('listRequestedByMe reads my rows carrying any assignee, whatever the status', async (db) => {
		const mia = await seedUser(db);
		const sam = await seedUser(db);
		const pending = await seedTask(db, {
			title: 'Asked of Sam',
			assignedTo: sam.id,
			assignmentStatus: 'pending',
			userId: mia.id
		});
		const declined = await seedTask(db, {
			title: 'Declined back',
			assignedTo: sam.id,
			assignmentStatus: 'none',
			userId: mia.id
		});
		await seedTask(db, { title: 'Unoffered', userId: mia.id });
		const rows = await listRequestedByMe(db, mia.id);
		expect(rows.map((row) => row.id).sort()).toEqual([pending.id, declined.id].sort());
	});

	rollbackTest('listFamilyTaskRows reads one family`s rows only', async (db) => {
		const mia = await seedUser(db);
		const home = await seedTaskFamily(db, 'Home');
		const work = await seedTaskFamily(db, 'Work');
		const inHome = await seedTask(db, { title: 'Home', familyId: home.id, userId: mia.id });
		await seedTask(db, { title: 'Work', familyId: work.id, userId: mia.id });
		await seedTask(db, { title: 'Personal', familyId: null, userId: mia.id });
		const rows = await listFamilyTaskRows(db, home.id);
		expect(rows.map((row) => row.id)).toEqual([inHome.id]);
	});

	rollbackTest(
		'listPublicFamilyTasks reads public personal rows of the given members only',
		async (db) => {
			const mia = await seedUser(db);
			const sam = await seedUser(db);
			const lee = await seedUser(db);
			const family = await seedTaskFamily(db);
			await addMember(db, mia.id, family.id);
			await addMember(db, sam.id, family.id);

			const publicMine = await seedTask(db, { title: 'Public mine', familyId: null, userId: mia.id });
			await seedTask(db, {
				title: 'Private mine',
				visibility: 'private',
				familyId: null,
				userId: mia.id
			});
			await seedTask(db, {
				title: 'Family task',
				familyId: family.id,
				userId: mia.id
			});
			const publicSam = await seedTask(db, {
				title: 'Public Sam',
				familyId: null,
				userId: sam.id
			});
			await seedTask(db, { title: 'Outsider', familyId: null, userId: lee.id });

			const rows = await listPublicFamilyTasks(db, [mia.id, sam.id]);
			expect(rows.map((row) => row.id).sort()).toEqual([publicMine.id, publicSam.id].sort());
			expect(await listPublicFamilyTasks(db, [])).toEqual([]);
		}
	);
});

describe('tags', () => {
	rollbackTest('listTagsForTasks keys the names by task, unordered', async (db) => {
		const mia = await seedUser(db);
		const first = await seedTask(db, { title: 'A', userId: mia.id });
		const second = await seedTask(db, { title: 'B', userId: mia.id });
		await seedTaskTags(db, first.id, ['shopping', 'milk']);
		await seedTaskTags(db, second.id, ['work']);

		const map = await listTagsForTasks(db, [first.id, second.id]);
		expect([...(map.get(first.id) ?? [])].sort()).toEqual(['milk', 'shopping']);
		expect(map.get(second.id)).toEqual(['work']);
		expect(await listTagsForTasks(db, [])).toEqual(new Map());
	});

	rollbackTest('replaceTaskTags swaps the whole set and insertTaskTags appends', async (db) => {
		const mia = await seedUser(db);
		const row = await seedTask(db, { title: 'A', userId: mia.id });
		await insertTaskTags(db, row.id, ['milk', 'shopping']);
		expect((await listTagsForTasks(db, [row.id])).get(row.id)?.sort()).toEqual(['milk', 'shopping']);

		await replaceTaskTags(db, row.id, ['work']);
		expect((await listTagsForTasks(db, [row.id])).get(row.id)).toEqual(['work']);

		await replaceTaskTags(db, row.id, []);
		expect((await listTagsForTasks(db, [row.id])).has(row.id)).toBe(false);
	});
});

describe('completion history', () => {
	rollbackTest('insertCompletion appends, findLatestCompletion reads the newest, delete removes it', async (db) => {
		const mia = await seedUser(db);
		const row = await seedTask(db, { title: 'A', userId: mia.id });
		const older = await insertCompletion(db, {
			taskId: row.id,
			userId: mia.id,
			actorId: mia.id,
			completedAt: '2026-01-01 10:00:00+00'
		});
		const newer = await insertCompletion(db, {
			taskId: row.id,
			userId: mia.id,
			actorId: mia.id,
			completedAt: '2026-01-02 10:00:00+00'
		});

		const latest = await findLatestCompletion(db, row.id);
		expect(latest?.id).toBe(newer.id);
		expect(latest?.completedAt).toBe('2026-01-02 10:00:00+00');

		await deleteCompletionById(db, newer.id);
		expect(await findLatestCompletion(db, row.id)).toMatchObject({ id: older.id });
	});
});

describe('cursor writes', () => {
	rollbackTest('advanceCursorGuarded moves a matching due and increments the count', async (db) => {
		const mia = await seedUser(db);
		const row = await seedTask(db, {
			title: 'Daily',
			dueDate: '2026-01-01T00:00:00.000Z',
			recurrenceFrequency: 'daily',
			recurrenceInterval: 1,
			completionCount: 2,
			userId: mia.id
		});
		const advanced = await advanceCursorGuarded(db, {
			taskId: row.id,
			expectedDue: '2026-01-01T00:00:00.000Z',
			dueDate: '2026-01-20T00:00:00.000-05:00'
		});
		expect(advanced?.completionCount).toBe(3);
		expect(advanced?.dueDate).toBe('2026-01-20 05:00:00+00');
	});

	rollbackTest('advanceCursorGuarded misses a stale expected due and changes nothing', async (db) => {
		const mia = await seedUser(db);
		const row = await seedTask(db, {
			title: 'Daily',
			dueDate: '2026-01-01T00:00:00.000Z',
			recurrenceFrequency: 'daily',
			completionCount: 2,
			userId: mia.id
		});
		expect(
			await advanceCursorGuarded(db, {
				taskId: row.id,
				expectedDue: '2025-12-31T00:00:00.000Z',
				dueDate: '2026-01-20T00:00:00.000Z'
			})
		).toBeNull();
		expect((await findTask(db, row.id))?.completionCount).toBe(2);
	});

	rollbackTest('advanceCursorGuarded still matches when the stored due is null', async (db) => {
		const mia = await seedUser(db);
		const row = await seedTask(db, {
			title: 'Dateless',
			dueDate: null,
			recurrenceFrequency: 'daily',
			userId: mia.id
		});
		const advanced = await advanceCursorGuarded(db, {
			taskId: row.id,
			expectedDue: null,
			dueDate: '2026-01-20T00:00:00.000Z'
		});
		expect(advanced?.dueDate).toBe('2026-01-20 00:00:00+00');
	});

	rollbackTest('skipCursor moves the due and reopens a completed row', async (db) => {
		const mia = await seedUser(db);
		const row = await seedTask(db, {
			title: 'Daily',
			dueDate: '2026-01-01T00:00:00.000Z',
			completedAt: '2026-01-01T10:00:00Z',
			recurrenceFrequency: 'daily',
			userId: mia.id
		});
		const skipped = await skipCursor(db, { taskId: row.id, dueDate: '2026-01-21T00:00:00.000Z' });
		expect(skipped?.dueDate).toBe('2026-01-21 00:00:00+00');
		expect(skipped?.completedAt).toBeNull();
	});

	rollbackTest('rewindCursorGuarded decrements and refuses at zero', async (db) => {
		const mia = await seedUser(db);
		const row = await seedTask(db, {
			title: 'Daily',
			dueDate: '2026-01-02T00:00:00.000Z',
			recurrenceFrequency: 'daily',
			completionCount: 3,
			userId: mia.id
		});
		const rewound = await rewindCursorGuarded(db, {
			taskId: row.id,
			dueDate: '2026-01-01T00:00:00.000Z'
		});
		expect(rewound?.completionCount).toBe(2);

		const zero = await seedTask(db, {
			title: 'Zero',
			recurrenceFrequency: 'daily',
			completionCount: 0,
			userId: mia.id
		});
		expect(
			await rewindCursorGuarded(db, { taskId: zero.id, dueDate: '2026-01-01T00:00:00.000Z' })
		).toBeNull();
	});

	rollbackTest('pinDueDates moves exactly the given ids', async (db) => {
		const mia = await seedUser(db);
		const stale = await seedTask(db, {
			title: 'Stale',
			dueDate: '2020-01-01T00:00:00.000Z',
			recurrenceFrequency: 'daily',
			userId: mia.id
		});
		const other = await seedTask(db, {
			title: 'Other',
			dueDate: '2020-01-01T00:00:00.000Z',
			recurrenceFrequency: 'daily',
			userId: mia.id
		});
		expect(await pinDueDates(db, { taskIds: [stale.id], dueDate: '2026-01-20T23:59:00.000Z' })).toBe(1);
		expect((await findTask(db, stale.id))?.dueDate).toBe('2026-01-20 23:59:00+00');
		expect((await findTask(db, other.id))?.dueDate).toBe('2020-01-01 00:00:00+00');
		expect(await pinDueDates(db, { taskIds: [], dueDate: '2026-01-20T23:59:00.000Z' })).toBe(0);
	});

	rollbackTest(
		'listPinnableTasks reads open dated recurring rows in own + family scope',
		async (db) => {
			const mia = await seedUser(db);
			const sam = await seedUser(db);
			const family = await seedTaskFamily(db);
			await addMember(db, mia.id, family.id);
			await addMember(db, sam.id, family.id);

			const mine = await seedTask(db, {
				title: 'Mine stale',
				dueDate: '2020-01-01T00:00:00.000Z',
				recurrenceFrequency: 'daily',
				userId: mia.id
			});
			const samsFamily = await seedTask(db, {
				title: 'Sam family stale',
				dueDate: '2020-01-01T00:00:00.000Z',
				recurrenceFrequency: 'weekly',
				familyId: family.id,
				userId: sam.id
			});
			await seedTask(db, {
				title: 'No frequency',
				dueDate: '2020-01-01T00:00:00.000Z',
				userId: mia.id
			});
			await seedTask(db, {
				title: 'Completed',
				dueDate: '2020-01-01T00:00:00.000Z',
				completedAt: '2026-01-01T00:00:00Z',
				recurrenceFrequency: 'daily',
				userId: mia.id
			});
			await seedTask(db, {
				title: 'Archived',
				dueDate: '2020-01-01T00:00:00.000Z',
				archivedAt: '2026-01-01T00:00:00Z',
				recurrenceFrequency: 'daily',
				userId: mia.id
			});
			await seedTask(db, {
				title: 'Dateless',
				dueDate: null,
				recurrenceFrequency: 'daily',
				userId: mia.id
			});

			const own = await listPinnableTasks(db, { userId: mia.id, familyId: family.id });
			expect(own.map((row) => row.id).sort()).toEqual([mine.id, samsFamily.id].sort());

			// The Public tab's member-personal leg: Sam's PERSONAL recurring row
			// is in no other scope, and the family member list reaches it.
			const samsPersonal = await seedTask(db, {
				title: 'Sam personal stale',
				dueDate: '2020-01-01T00:00:00.000Z',
				recurrenceFrequency: 'daily',
				userId: sam.id
			});
			const publicTab = await listPinnableTasks(db, {
				userId: null,
				familyId: family.id,
				memberIds: [mia.id, sam.id]
			});
			expect(publicTab.map((row) => row.id).sort()).toEqual(
				[mine.id, samsFamily.id, samsPersonal.id].sort()
			);

			expect(await listPinnableTasks(db, { userId: null, familyId: null })).toEqual([]);
		}
	);

	rollbackTest('a completion and its advance leave the history row intact', async (db) => {
		const mia = await seedUser(db);
		const row = await seedTask(db, {
			title: 'Daily',
			dueDate: '2026-01-01T00:00:00.000Z',
			recurrenceFrequency: 'daily',
			userId: mia.id
		});
		await advanceCursorGuarded(db, {
			taskId: row.id,
			expectedDue: '2026-01-01T00:00:00.000Z',
			dueDate: '2026-01-20T00:00:00.000Z'
		});
		await insertCompletion(db, {
			taskId: row.id,
			userId: mia.id,
			actorId: mia.id,
			completedAt: '2026-01-19 10:00:00+00'
		});
		expect(await db.select().from(taskCompletions)).toHaveLength(1);
		expect((await db.select().from(tasks))[0]?.completedAt).toBeNull();
	});
});
