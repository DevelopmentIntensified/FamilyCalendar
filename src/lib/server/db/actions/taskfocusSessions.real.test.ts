import { afterAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * REAL-Postgres check of the drizzle TaskfocusSessionStore (#293): user
 * scoping, the absorbed_at write guards, the one-open-per-user partial
 * unique index, the task access check, and the GET /api/tasks overlay.
 * Needs the #002 harness DB (`npm run db:push:test`).
 */
import { db } from '$lib/server/db';
import { taskfocusSessions, tasks, users } from '$lib/server/db/schema';
import { closeTestPool, resetTestDb } from '$lib/server/db/testHarness';
import {
	absorbPhoneSession,
	createPhoneSession,
	deletePhoneSession,
	drizzleTaskfocusSessionStore as store,
	endPhoneSession,
	listUnabsorbedSessions,
	withPhoneFocus
} from './taskfocusSessions';

afterAll(async () => {
	await closeTestPool();
});

const ME = 'tfs-me';
const OTHER = 'tfs-other';
const NOW = new Date();
const iso = (min: number) => new Date(NOW.getTime() + min * 60000).toISOString();

async function seedUser(id: string) {
	await db
		.insert(users)
		.values({ id, firstName: id, lastName: 'H', email: `${id}@h.invalid`, roles: [] });
}

beforeEach(async () => {
	await resetTestDb();
	await seedUser(ME);
	await seedUser(OTHER);
	await db.insert(tasks).values([
		{ id: 'mine', title: 'mine', userId: ME },
		{
			id: 'assigned',
			title: 'assigned',
			userId: OTHER,
			assignedTo: ME,
			assignmentStatus: 'accepted'
		},
		{ id: 'theirs', title: 'theirs', userId: OTHER }
	]);
});

describe('taskfocus sessions — real Postgres', () => {
	it('task access: owned and assigned yes, others no', async () => {
		expect(await store.canSeeTask(ME, 'mine')).toBe(true);
		expect(await store.canSeeTask(ME, 'assigned')).toBe(true);
		expect(await store.canSeeTask(ME, 'theirs')).toBe(false);
		expect(await store.canSeeTask(ME, 'missing')).toBe(false);
	});

	it('the partial unique index allows one open session per user', async () => {
		const a = await createPhoneSession(ME, { taskId: 'mine', startedAt: iso(-5) });
		expect(a.kind).toBe('created');
		expect(
			await store.insert({ userId: ME, taskId: 'mine', startedAt: new Date(), endedAt: null })
		).toBeUndefined();
		const closed = await createPhoneSession(ME, {
			taskId: 'mine',
			startedAt: iso(-60),
			endedAt: iso(-50)
		});
		expect(closed.kind).toBe('created');
	});

	it('end / absorb / delete lifecycle with guards and scoping', async () => {
		const c = await createPhoneSession(ME, { taskId: 'mine', startedAt: iso(-30) });
		if (c.kind !== 'created') throw new Error(c.kind);
		const id = c.session.id;
		expect((await absorbPhoneSession(ME, id)).kind).toBe('open');
		expect((await endPhoneSession(OTHER, id, { endedAt: iso(0) })).kind).toBe('not_found');
		expect((await endPhoneSession(ME, id, { endedAt: iso(0) })).kind).toBe('ended');
		expect((await listUnabsorbedSessions(ME)).map((s) => s.id)).toEqual([id]);
		expect(await listUnabsorbedSessions(OTHER)).toEqual([]);
		expect((await absorbPhoneSession(OTHER, id)).kind).toBe('not_found');
		expect((await absorbPhoneSession(ME, id)).kind).toBe('absorbed');
		expect((await absorbPhoneSession(ME, id)).kind).toBe('absorbed');
		expect((await endPhoneSession(ME, id, { endedAt: iso(0) })).kind).toBe('absorbed');
		expect(await deletePhoneSession(ME, id)).toBe('absorbed');
		expect(await listUnabsorbedSessions(ME)).toEqual([]);
	});

	it("overlay counts the caller's closed+unabsorbed minutes and the open start", async () => {
		await createPhoneSession(ME, { taskId: 'mine', startedAt: iso(-100), endedAt: iso(-89.5) });
		await createPhoneSession(OTHER, { taskId: 'theirs', startedAt: iso(-100), endedAt: iso(-10) });
		await createPhoneSession(ME, { taskId: 'assigned', startedAt: iso(-3) });
		const out = await withPhoneFocus(ME, [{ id: 'mine' }, { id: 'assigned' }, { id: 'theirs' }]);
		expect(out.map((t) => t.phoneFocusMinutes)).toEqual([10, 0, 0]);
		expect(out[1].phoneFocusStartedAt?.toISOString()).toBe(iso(-3));
	});

	it('cascades with the task', async () => {
		await createPhoneSession(ME, { taskId: 'mine', startedAt: iso(-10), endedAt: iso(-5) });
		await db.delete(tasks);
		expect(await db.select().from(taskfocusSessions)).toEqual([]);
	});
});
