/**
 * tasks guest merge against real Postgres: every Task the guest owns changes
 * owner, and nothing else does — ids, tags and completion history survive.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect } from 'vitest';
import { tasks } from '$lib/kernel/db/tables.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { eq } from 'drizzle-orm';
import { seedTask } from './tasks.fixtures.server';
import { moveGuestTasks } from './tasks.guest.service.server';

const NOW = '2026-04-01T12:00:00.000Z';

describe('moveGuestTasks', () => {
	rollbackTest('moves every guest Task and leaves another person’s alone', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		const guest = await seedUser(db, { email: 'guest-tasks@anonymous.placeholder.invalid' });
		const target = await seedUser(db, { email: 'target-tasks@example.test' });
		const stranger = await seedUser(db, { email: 'stranger-tasks@example.test' });
		const first = await seedTask(db, { id: 'task-guest-1', title: 'Pack bags', userId: guest.id });
		const second = await seedTask(db, {
			id: 'task-guest-2',
			title: 'Book taxi',
			userId: guest.id,
			completedAt: NOW,
			completionCount: 2
		});
		const theirs = await seedTask(db, { id: 'task-stranger', title: 'Theirs', userId: stranger.id });

		expect(await moveGuestTasks(ctx, { from: guest.id, to: target.id })).toBe(2);

		const moved = await db.select().from(tasks).where(eq(tasks.userId, target.id));
		expect(moved.map((row) => row.id).sort()).toEqual([first.id, second.id].sort());
		// History and titles are untouched by the move.
		expect(moved.find((row) => row.id === second.id)?.completionCount).toBe(2);
		const [kept] = await db.select().from(tasks).where(eq(tasks.id, theirs.id));
		expect(kept?.userId).toBe(stranger.id);
		expect(await db.select().from(tasks).where(eq(tasks.userId, guest.id))).toEqual([]);
	});

	rollbackTest('same person moves nothing', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		const person = await seedUser(db, { email: 'same-tasks@example.test' });
		await seedTask(db, { id: 'task-same', title: 'Mine', userId: person.id });
		expect(await moveGuestTasks(ctx, { from: person.id, to: person.id })).toBe(0);
		expect(await db.select().from(tasks).where(eq(tasks.userId, person.id))).toHaveLength(1);
	});
});
