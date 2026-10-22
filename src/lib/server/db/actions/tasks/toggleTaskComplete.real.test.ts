import { afterAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * REAL-Postgres pilot for #002/#116: `toggleTaskComplete` exercised through
 * the ACTUAL modules — no `vi.mock('$lib/server/db')` anywhere. The paired
 * scripted-stub peasant (toggleTaskComplete.test.ts) stays untouched so the
 * mock-vs-real seam difference stays inspectable side by side, as #116 asks.
 *
 * What the mock physically cannot verify — and what runs against a real
 * Postgres row here for the first time:
 *   - the double-click RACE (two concurrent completions; the guarded UPDATE
 *     decides under a real row lock, not a stub queue)
 *   - append-only completion history (un-complete must NOT delete the row)
 *   - the authorization legs end-to-end (owner / family member / outsider)
 *
 * DB lane: vitest-setup-server.ts pins DATABASE_URL to
 * localhost:5433/familycalendar_test before this module resolves, so the
 * `$lib/server/db` singleton used by the actions itself is the harness db.
 * Schema comes from `npm run db:push:test`; state resets per test.
 */
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { familyMembers, families, taskCompletions, tasks, users } from '$lib/server/db/schema';
import { closeTestPool, resetTestDb, testPool } from '$lib/server/db/testHarness';
import { toggleTaskComplete } from './index';

afterAll(async () => {
	await closeTestPool();
});

const OWNER = 'harness-owner';
const CO_MEMBER = 'harness-comember';
const OUTSIDER = 'harness-outsider';
const FAMILY = 'harness-family';

async function seedUser(id: string): Promise<string> {
	await db.insert(users).values({
		id,
		firstName: id.split('-').pop() ?? 'Probe',
		lastName: 'Harness',
		email: `${id}@harness.invalid`,
		roles: []
	});
	return id;
}

let seedCounter = 0;
async function seedTask(overrides: {
	familyId?: string | null;
	assignedTo?: string | null;
	assignmentStatus?: string;
}): Promise<string> {
	seedCounter += 1;
	const id = `harness-task-${seedCounter}`;
	await db.insert(tasks).values({
		id,
		title: `Harness task ${seedCounter}`,
		recurrenceFrequency: null, // plain task: the plain toggle leg, not the cursor roll
		completionCount: 0,
		assignmentStatus: overrides.assignmentStatus ?? 'none',
		visibility: 'public',
		userId: OWNER,
		familyId: overrides.familyId ?? null,
		assignedTo: overrides.assignedTo ?? null
	});
	return id;
}

beforeEach(async () => {
	await resetTestDb();
	await Promise.all([seedUser(OWNER), seedUser(CO_MEMBER), seedUser(OUTSIDER)]);
});

describe('toggleTaskComplete — real Postgres seam (pilot)', () => {
	it('completes and records append-only history attributed to the acting user', async () => {
		const id = await seedTask({});
		const updated = await toggleTaskComplete(id, OWNER);

		expect(updated?.completedAt).not.toBeNull();
		const [row] = await testPool().unsafe<{ actorId: string | null }>(
			`SELECT "actorId" FROM "taskCompletions" WHERE "taskId" = $1`,
			[id]
		);
		expect(row.actorId).toBe(OWNER);
	});

	it('double-click race completes exactly once under a real row lock', async () => {
		const id = await seedTask({});
		// Both calls read the still-open task; the guarded UPDATE
		// (`completedAt IS NULL`) serializes them in Postgres.
		const results = await Promise.allSettled([
			toggleTaskComplete(id, OWNER),
			toggleTaskComplete(id, OWNER)
		]);

		expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
		const [after] = await db.select().from(tasks).where(eq(tasks.id, id));
		expect(after?.completedAt).not.toBeNull();

		const rows = await testPool().unsafe<{ c: number }>(
			`SELECT count(*)::int AS c FROM "taskCompletions" WHERE "taskId" = $1`,
			[id]
		);
		expect(rows[0].c).toBe(1);
	});

	it('un-complete keeps the history row and only sets the un-completed state', async () => {
		const id = await seedTask({});

		await toggleTaskComplete(id, OWNER);
		const undone = await toggleTaskComplete(id, OWNER);
		expect(undone?.completedAt).toBeNull();

		const rows = await testPool().unsafe<{ c: number }>(
			`SELECT count(*)::int AS c FROM "taskCompletions" WHERE "taskId" = $1`,
			[id]
		);
		// Append-only: the completion row survives one login; un-completing
		// does not erase that it happened.
		expect(rows[0].c).toBe(1);
	});

	it('a second completion appends its own history row', async () => {
		const id = await seedTask({});
		await toggleTaskComplete(id, OWNER);
		await toggleTaskComplete(id, OWNER);
		await toggleTaskComplete(id, OWNER);

		const rows = await testPool().unsafe<{ c: number }>(
			`SELECT count(*)::int AS c FROM "taskCompletions" WHERE "taskId" = $1`,
			[id]
		);
		expect(rows[0].c).toBe(2);
	});

	it('refuses outsiders: undefined result, no state change, no history', async () => {
		const id = await seedTask({});

		const result = await toggleTaskComplete(id, OUTSIDER);
		expect(result).toBeUndefined();

		const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
		expect(task?.completedAt).toBeNull();

		const rows = await testPool().unsafe<{ c: number }>(
			`SELECT count(*)::int AS c FROM "taskCompletions" WHERE "taskId" = $1`,
			[id]
		);
		expect(rows[0].c).toBe(0);
	});

	it('family member may toggle a family task and gets attributed as the actor', async () => {
		await db.insert(families).values({ id: FAMILY, name: 'Harness family' });
		await db.insert(familyMembers).values({ userId: OWNER, familyId: FAMILY });
		await db.insert(familyMembers).values({ userId: CO_MEMBER, familyId: FAMILY });
		const id = await seedTask({ familyId: FAMILY });

		const updated = await toggleTaskComplete(id, CO_MEMBER);
		expect(updated?.completedAt).not.toBeNull();

		const [row] = await testPool().unsafe<{ actorId: string | null }>(
			`SELECT "actorId" FROM "taskCompletions" WHERE "taskId" = $1`,
			[id]
		);
		expect(row.actorId).toBe(CO_MEMBER);
	});
});
