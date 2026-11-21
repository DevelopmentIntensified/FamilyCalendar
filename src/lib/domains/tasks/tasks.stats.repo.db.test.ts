/**
 * The stats repo against real Postgres: every completion figure, the
 * attribution predicate's two legs, and the counting scopes (#092/#146).
 * Each test runs in `rollbackTest`.
 *
 * Doc: ./README.md#how-to-test
 */
import { describe, expect } from 'vitest';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { seedTask, seedTaskCompletion } from './tasks.fixtures.server';
import {
	countCompletedOnce,
	countRecurringCompletions,
	countRecurringTasks,
	listCompletionInstantRows,
	listDoneByIds,
	listRecentCompletions,
	listTopAssigneeIds,
	listTopAssignerIds,
	monthTotals
} from './tasks.stats.repo.server';

describe('attribution', () => {
	rollbackTest('counts the actor leg and the legacy owner fallback, never the other actor', async (db) => {
		const mia = await seedUser(db);
		const sam = await seedUser(db);

		const legacy = await seedTask(db, { title: 'Legacy row', userId: mia.id });
		await seedTaskCompletion(db, {
			taskId: legacy.id,
			userId: mia.id,
			actorId: null,
			completedAt: '2026-01-01 10:00:00+00'
		});
		const actedByMe = await seedTask(db, { title: 'Sam`s task', userId: sam.id });
		await seedTaskCompletion(db, {
			taskId: actedByMe.id,
			userId: sam.id,
			actorId: mia.id,
			completedAt: '2026-01-02 10:00:00+00'
		});
		const actedBySam = await seedTask(db, { title: 'Mine, done by Sam', userId: mia.id });
		await seedTaskCompletion(db, {
			taskId: actedBySam.id,
			userId: mia.id,
			actorId: sam.id,
			completedAt: '2026-01-03 10:00:00+00'
		});

		// TWO distinct tasks attributed to Mia: the legacy row + the one she acted on.
		expect(await countCompletedOnce(db, mia.id)).toBe(2);
		expect(await listCompletionInstantRows(db, { userId: mia.id, limit: 365 })).toEqual([
			'2026-01-02 10:00:00+00',
			'2026-01-01 10:00:00+00'
		]);
	});

	rollbackTest('the instants read is newest first and capped', async (db) => {
		const mia = await seedUser(db);
		const task = await seedTask(db, { title: 'Mine', userId: mia.id });
		for (const day of ['01', '02', '03']) {
			await seedTaskCompletion(db, {
				taskId: task.id,
				userId: mia.id,
				actorId: mia.id,
				completedAt: `2026-01-${day} 10:00:00+00`
			});
		}
		expect(await listCompletionInstantRows(db, { userId: mia.id, limit: 2 })).toEqual([
			'2026-01-03 10:00:00+00',
			'2026-01-02 10:00:00+00'
		]);
	});
});

describe('counts', () => {
	rollbackTest('counts recurring Task rows, not completions', async (db) => {
		const mia = await seedUser(db);
		const recurring = await seedTask(db, {
			title: 'Daily',
			recurrenceFrequency: 'daily',
			userId: mia.id
		});
		await seedTask(db, { title: 'One-off', userId: mia.id });
		await seedTask(db, { title: 'Someone else`s', recurrenceFrequency: 'daily', userId: (await seedUser(db)).id });
		await seedTaskCompletion(db, {
			taskId: recurring.id,
			userId: mia.id,
			actorId: mia.id,
			completedAt: '2026-01-01 10:00:00+00'
		});
		expect(await countRecurringTasks(db, mia.id)).toBe(1);
		expect(await countRecurringCompletions(db, mia.id)).toBe(1);
	});

	rollbackTest('a one-off completion is not a recurring completion', async (db) => {
		const mia = await seedUser(db);
		const oneOff = await seedTask(db, { title: 'One-off', userId: mia.id });
		await seedTaskCompletion(db, {
			taskId: oneOff.id,
			userId: mia.id,
			actorId: mia.id,
			completedAt: '2026-01-01 10:00:00+00'
		});
		expect(await countRecurringCompletions(db, mia.id)).toBe(0);
	});
});

describe('named figures by id', () => {
	rollbackTest('ranks assigners (others) and assignees (others), most first', async (db) => {
		const mia = await seedUser(db);
		const sam = await seedUser(db);
		const lee = await seedUser(db);

		await seedTask(db, { title: 'From Sam 1', assignedTo: mia.id, userId: sam.id });
		await seedTask(db, { title: 'From Sam 2', assignedTo: mia.id, userId: sam.id });
		await seedTask(db, { title: 'From Lee', assignedTo: mia.id, userId: lee.id });
		// Self-assignment is not a handoff on either side.
		await seedTask(db, { title: 'Mine to me', assignedTo: mia.id, userId: mia.id });

		await seedTask(db, { title: 'To Lee 1', assignedTo: lee.id, userId: mia.id });
		await seedTask(db, { title: 'To Lee 2', assignedTo: lee.id, userId: mia.id });
		await seedTask(db, { title: 'To Sam', assignedTo: sam.id, userId: mia.id });

		expect(await listTopAssignerIds(db, { userId: mia.id, limit: 5 })).toEqual([
			{ id: sam.id, total: 2 },
			{ id: lee.id, total: 1 }
		]);
		expect(await listTopAssigneeIds(db, { userId: mia.id, limit: 5 })).toEqual([
			{ id: lee.id, total: 2 },
			{ id: sam.id, total: 1 }
		]);
	});

	rollbackTest('recent completions are newest first and capped', async (db) => {
		const mia = await seedUser(db);
		for (const [index, day] of ['01', '02', '03'].entries()) {
			const task = await seedTask(db, { title: `Done ${index + 1}`, userId: mia.id });
			await seedTaskCompletion(db, {
				taskId: task.id,
				userId: mia.id,
				actorId: mia.id,
				completedAt: `2026-01-${day} 10:00:00+00`
			});
		}
		const rows = await listRecentCompletions(db, { userId: mia.id, limit: 2 });
		expect(rows.map((row) => row.title)).toEqual(['Done 3', 'Done 2']);
		expect(rows[0]?.recurrenceFrequency).toBeNull();
	});

	rollbackTest('doneBy stays scoped to the viewer`s OWN Task rows', async (db) => {
		const mia = await seedUser(db);
		const sam = await seedUser(db);
		const mine = await seedTask(db, { title: 'Mine', userId: mia.id });
		const theirs = await seedTask(db, { title: 'Theirs', userId: sam.id });
		await seedTaskCompletion(db, {
			taskId: mine.id,
			userId: mia.id,
			actorId: sam.id,
			completedAt: '2026-01-01 10:00:00+00'
		});
		await seedTaskCompletion(db, {
			taskId: mine.id,
			userId: mia.id,
			actorId: sam.id,
			completedAt: '2026-01-02 10:00:00+00'
		});
		// Sam acting on HIS OWN row is not part of Mia's "done by" breakdown.
		await seedTaskCompletion(db, {
			taskId: theirs.id,
			userId: sam.id,
			actorId: sam.id,
			completedAt: '2026-01-03 10:00:00+00'
		});
		expect(await listDoneByIds(db, { userId: mia.id, limit: 6 })).toEqual([
			{ id: sam.id, total: 2 }
		]);
	});

	rollbackTest('monthTotals splits the month by whether the Task recurs', async (db) => {
		const mia = await seedUser(db);
		const recurring = await seedTask(db, {
			title: 'Daily',
			recurrenceFrequency: 'daily',
			userId: mia.id
		});
		const oneOff = await seedTask(db, { title: 'One-off', userId: mia.id });
		await seedTaskCompletion(db, {
			taskId: recurring.id,
			userId: mia.id,
			actorId: mia.id,
			completedAt: '2026-03-05 10:00:00+00'
		});
		await seedTaskCompletion(db, {
			taskId: oneOff.id,
			userId: mia.id,
			actorId: mia.id,
			completedAt: '2026-03-06 10:00:00+00'
		});
		await seedTaskCompletion(db, {
			taskId: oneOff.id,
			userId: mia.id,
			actorId: mia.id,
			completedAt: '2026-02-28 10:00:00+00'
		});

		expect(
			await monthTotals(db, { userId: mia.id, monthStart: '2026-03-01T00:00:00.000Z' })
		).toEqual({ completed: 2, recurring: 1 });
	});
});
