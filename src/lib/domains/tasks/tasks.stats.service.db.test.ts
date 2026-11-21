/**
 * tasks stats services against real Postgres: the counting path, the names it
 * asks identity for, the streak window and the `/api/stats` page body. Each
 * test runs in `rollbackTest` and `testCtx({ db })` supplies the clock, so the
 * month and the streak land on the instant the test names.
 *
 * Expected values come from legacy `taskStats.ts` / `statsData.ts` and the
 * frozen `/api/stats` golden (`tasks.http.db.test.ts`).
 *
 * Doc: ./README.md#how-to-test
 */
import { describe, expect } from 'vitest';
import { actorFromUser } from '$lib/kernel/ctx/actor';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import {
	getStatsPage,
	getTaskStats,
	listCompletionInstants,
	TASK_STATS_DONE_BY_LIMIT,
	TASK_STATS_PEOPLE_LIMIT,
	TASK_STATS_RECENT_LIMIT
} from './tasks.stats.service.server';
import {
	addMember,
	seedTask,
	seedTaskCompletion,
	seedTaskFamily,
	seedUserZone
} from './tasks.fixtures.server';

const NOW = '2026-03-01T12:00:00.000Z';

describe('getTaskStats', () => {
	rollbackTest('answers the empty snapshot for a user with no completions and no family', async (db) => {
		const mia = await seedUser(db, { firstName: 'Mia' });

		const stats = await getTaskStats(testCtx({ db, now: NOW }), actorFromUser(mia, 'session'));

		expect(stats).toEqual({
			completedOnce: 0,
			recurringTasks: 0,
			recurringCompletions: 0,
			topAssigners: [],
			topAssignees: [],
			recentlyCompleted: [],
			month: { completed: 0, recurring: 0 },
			doneBy: []
		});
	});

	rollbackTest('counts completions by actor with the legacy owner fallback (#092/#146)', async (db) => {
		const ctxValue = testCtx({ db, now: NOW });
		const mia = await seedUser(db, { firstName: 'Mia', lastName: 'Diaz' });
		const sam = await seedUser(db, { firstName: 'Sam', lastName: 'Roy' });
		const first = await seedTask(db, { title: 'First', userId: mia.id, completedAt: NOW });
		const recurring = await seedTask(db, {
			title: 'Recurring',
			recurrenceFrequency: 'daily',
			recurrenceInterval: 1,
			completionCount: 1,
			userId: mia.id
		});
		// A legacy row with no actor attributes to its owner.
		const legacy = await seedTask(db, { title: 'Legacy', userId: mia.id });
		const bySam = await seedTask(db, { title: 'Done by Sam', userId: mia.id, completedAt: NOW });
		await seedTaskCompletion(db, { taskId: first.id, userId: mia.id, actorId: mia.id });
		await seedTaskCompletion(db, { taskId: recurring.id, userId: mia.id, actorId: mia.id });
		await seedTaskCompletion(db, { taskId: legacy.id, userId: mia.id, actorId: null });
		await seedTaskCompletion(db, { taskId: bySam.id, userId: mia.id, actorId: sam.id });

		const stats = await getTaskStats(ctxValue, actorFromUser(mia, 'session'));

		expect(stats).toMatchObject({
			completedOnce: 3,
			recurringTasks: 1,
			recurringCompletions: 1,
			// `users.firstName` only — the legacy actorRows projection.
			doneBy: [
				{ name: 'Mia', count: 2 },
				{ name: 'Sam', count: 1 }
			],
			recentlyCompleted: expect.arrayContaining([
				{ title: 'First', completedAt: expect.stringMatching(/Z$/), recurring: false },
				{ title: 'Recurring', completedAt: expect.stringMatching(/Z$/), recurring: true },
				{ title: 'Legacy', completedAt: expect.stringMatching(/Z$/), recurring: false }
			])
		});
		expect(stats.doneBy).toHaveLength(2);
	});

	rollbackTest('names assigners/assignees with the stored full name, trailing space kept', async (db) => {
		const mia = await seedUser(db, { firstName: 'Mia', lastName: 'Diaz' });
		// users.lastName is NOT NULL, so an empty last name keeps the SQL join's trailing space.
		const sam = await seedUser(db, { firstName: 'Sam', lastName: '' });
		const lee = await seedUser(db, { firstName: 'Lee', lastName: 'Kai' });
		await seedTask(db, { title: 'From Sam 1', assignedTo: mia.id, userId: sam.id });
		await seedTask(db, { title: 'From Sam 2', assignedTo: mia.id, userId: sam.id });
		await seedTask(db, { title: 'From Lee', assignedTo: mia.id, userId: lee.id });
		await seedTask(db, { title: 'To Lee 1', assignedTo: lee.id, userId: mia.id });
		await seedTask(db, { title: 'To Lee 2', assignedTo: lee.id, userId: mia.id });
		await seedTask(db, { title: 'To Sam', assignedTo: sam.id, userId: mia.id });

		const stats = await getTaskStats(testCtx({ db, now: NOW }), actorFromUser(mia, 'session'));

		expect(stats.topAssigners).toEqual([
			{ name: 'Sam ', total: 2 },
			{ name: 'Lee Kai', total: 1 }
		]);
		expect(stats.topAssignees).toEqual([
			{ name: 'Lee Kai', total: 2 },
			{ name: 'Sam ', total: 1 }
		]);
	});

	rollbackTest('keeps the ten latest check-offs, newest first', async (db) => {
		const mia = await seedUser(db, { firstName: 'Mia', lastName: 'Diaz' });
		const instants = Array.from({ length: TASK_STATS_RECENT_LIMIT + 1 }, (_, index) =>
			new Date(Date.UTC(2026, 2, 1, 0, index)).toISOString()
		);
		for (const [index, completedAt] of instants.entries()) {
			const task = await seedTask(db, {
				title: `Done ${String(index + 1).padStart(2, '0')}`,
				userId: mia.id
			});
			await seedTaskCompletion(db, { taskId: task.id, userId: mia.id, actorId: mia.id, completedAt });
		}

		const stats = await getTaskStats(testCtx({ db, now: NOW }), actorFromUser(mia, 'session'));

		expect(stats.recentlyCompleted).toHaveLength(TASK_STATS_RECENT_LIMIT);
		expect(stats.recentlyCompleted.map((row) => row.title)).toEqual(
			instants
				.slice()
				.reverse()
				.slice(0, TASK_STATS_RECENT_LIMIT)
				.map((_, index) => `Done ${String(instants.length - index).padStart(2, '0')}`)
		);
	});

	rollbackTest('caps the assigner/assignee lists and the done-by list at their legacy sizes', async (db) => {
		const mia = await seedUser(db, { firstName: 'Mia', lastName: 'Diaz' });
		for (let index = 0; index < TASK_STATS_PEOPLE_LIMIT + 1; index += 1) {
			const assigner = await seedUser(db, { firstName: `A${index}`, lastName: 'Person' });
			await seedTask(db, {
				title: `From ${index}`,
				assignedTo: mia.id,
				userId: assigner.id
			});
			await seedTask(db, {
				title: `To ${index}`,
				assignedTo: assigner.id,
				userId: mia.id
			});
		}
		for (let index = 0; index < TASK_STATS_DONE_BY_LIMIT + 1; index += 1) {
			const actor = await seedUser(db, { firstName: `D${index}`, lastName: 'Person' });
			const task = await seedTask(db, { title: `Task ${index}`, userId: mia.id });
			await seedTaskCompletion(db, { taskId: task.id, userId: mia.id, actorId: actor.id });
		}

		const stats = await getTaskStats(testCtx({ db, now: NOW }), actorFromUser(mia, 'session'));

		expect(stats.topAssigners).toHaveLength(TASK_STATS_PEOPLE_LIMIT);
		expect(stats.topAssignees).toHaveLength(TASK_STATS_PEOPLE_LIMIT);
		expect(stats.doneBy).toHaveLength(TASK_STATS_DONE_BY_LIMIT);
	});

	rollbackTest('counts this month on the UTC boundary, ignoring the caller`s stored zone', async (db) => {
		const mia = await seedUser(db, { firstName: 'Mia', lastName: 'Diaz' });
		// Legacy took the PROCESS zone's month (`DateTime.now().startOf('month')`),
		// UTC in production and in the goldens — a stored zone never moved it.
		await seedUserZone(db, mia.id, 'Asia/Tokyo');
		const utcMarch = await seedTask(db, { title: 'UTC March', userId: mia.id });
		const tokyoOnlyMarch = await seedTask(db, { title: 'Tokyo March', userId: mia.id });
		await seedTaskCompletion(db, {
			taskId: utcMarch.id,
			userId: mia.id,
			actorId: mia.id,
			completedAt: '2026-03-01T01:00:00.000Z'
		});
		// Tokyo is already in March here; UTC is still in February.
		await seedTaskCompletion(db, {
			taskId: tokyoOnlyMarch.id,
			userId: mia.id,
			actorId: mia.id,
			completedAt: '2026-02-28T16:00:00.000Z'
		});

		const stats = await getTaskStats(
			testCtx({ db, now: '2026-03-01T02:00:00.000Z' }),
			actorFromUser(mia, 'session')
		);

		// UTC's March starts at 2026-03-01T00:00Z, so only the 01:00 check-off counts;
		// a stored-zone (Tokyo) month would have counted both.
		expect(stats.month).toEqual({ completed: 1, recurring: 0 });
		expect(stats.completedOnce).toBe(2);
	});
});

describe('listCompletionInstants', () => {
	rollbackTest('answers one ISO instant per attributed row, newest first, drops unparseable rows', async (db) => {
		const mia = await seedUser(db, { firstName: 'Mia', lastName: 'Diaz' });
		const older = await seedTask(db, { title: 'Older', userId: mia.id });
		const newer = await seedTask(db, { title: 'Newer', userId: mia.id });
		await seedTaskCompletion(db, {
			taskId: older.id,
			userId: mia.id,
			actorId: mia.id,
			completedAt: '2026-02-01 10:00:00+00'
		});
		await seedTaskCompletion(db, {
			taskId: newer.id,
			userId: mia.id,
			actorId: mia.id,
			completedAt: '2026-02-03T10:00:00.000Z'
		});

		const instants = await listCompletionInstants(
			testCtx({ db, now: NOW }),
			actorFromUser(mia, 'session')
		);

		expect(instants).toEqual(['2026-02-03T10:00:00.000Z', '2026-02-01T10:00:00.000Z']);
	});
});

describe('getStatsPage', () => {
	rollbackTest('composes the counting path, the streak, the instants and the family roster', async (db) => {
		const mia = await seedUser(db, { firstName: 'Mia', lastName: 'Diaz' });
		const sam = await seedUser(db, { firstName: 'Sam', lastName: 'Roy' });
		const family = await seedTaskFamily(db);
		await addMember(db, mia.id, family.id);
		await addMember(db, sam.id, family.id, 'member', 'child');
		const task = await seedTask(db, { title: 'First', userId: mia.id, completedAt: NOW });
		await seedTaskCompletion(db, {
			taskId: task.id,
			userId: mia.id,
			actorId: mia.id,
			completedAt: '2026-02-25T10:00:00.000Z'
		});

		const page = await getStatsPage(testCtx({ db, now: NOW }), actorFromUser(mia, 'session'));

		expect(page.todayIso).toBe(NOW);
		expect(page.completionIso).toEqual(['2026-02-25T10:00:00.000Z']);
		expect(page.stats.completedOnce).toBe(1);
		expect(page.streak).toEqual({
			current: 1,
			best: 1,
			freezeUsedInCurrentGap: false,
			lastCompletedWeek: '2026-W09'
		});
		// The month/done-by fields are the counting path's own echo, never a second read.
		expect(page.month).toEqual(page.stats.month);
		expect(page.doneBy).toEqual(page.stats.doneBy);
		expect(page.roster).toEqual(
			expect.arrayContaining([
				{ firstName: 'Mia', memberType: 'member' },
				{ firstName: 'Sam', memberType: 'child' }
			])
		);
	});

	rollbackTest('answers an empty streak and roster for a user with no history and no family', async (db) => {
		const mia = await seedUser(db, { firstName: 'Mia', lastName: 'Diaz' });

		const page = await getStatsPage(testCtx({ db, now: NOW }), actorFromUser(mia, 'session'));

		expect(page).toEqual({
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
			streak: { current: 0, best: 0, freezeUsedInCurrentGap: false, lastCompletedWeek: null },
			completionIso: [],
			todayIso: NOW,
			month: { completed: 0, recurring: 0 },
			doneBy: [],
			roster: []
		});
	});
});
