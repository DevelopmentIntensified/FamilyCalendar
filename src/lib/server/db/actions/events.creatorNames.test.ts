import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Scripted top-level drizzle select stub (same spirit as events.test.ts, but
 * no transaction needed): each select().from().where() result is queued in
 * call order; where() args are captured for shape assertions.
 */

const test = vi.hoisted(() => {
	const capturedWhere: unknown[] = [];
	const selectQueue: unknown[][] = [];
	const db = {
		select: () => ({
			from: () => ({
				// oxlint-disable-next-line anti-slop/no-unknown-parameters -- scripted drizzle stub; condition shape pinned by the capture assertion below.
				where: (cond: unknown) => {
					capturedWhere.push(cond);
					return Promise.resolve(selectQueue.shift() ?? []);
				}
			})
		})
	};
	return { db, capturedWhere, selectQueue };
});

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted drizzle stub pins the single inArray(users.id, …) query shape.
vi.mock('$lib/server/db', () => ({ db: test.db }));

import { getCreatorFirstNames } from './events';

beforeEach(() => {
	test.capturedWhere.length = 0;
	test.selectQueue.length = 0;
});

describe('getCreatorFirstNames', () => {
	it('returns an empty map without querying when no ownerIds', async () => {
		const map = await getCreatorFirstNames([]);
		expect(map.size).toBe(0);
		expect(test.capturedWhere.length).toBe(0);
	});

	it('dedupes ownerIds into ONE users query keyed by id', async () => {
		test.selectQueue.push([
			{ id: 'u1', firstName: 'Alice' },
			{ id: 'u2', firstName: 'Bob' }
		]);
		const map = await getCreatorFirstNames(['u1', 'u2', 'u1', 'u2']);
		expect(map.get('u1')).toBe('Alice');
		expect(map.get('u2')).toBe('Bob');
		// Exactly one query even though owners repeat across events.
		expect(test.capturedWhere.length).toBe(1);
	});

	it('missing owners simply have no entry (deleted user cascade edge)', async () => {
		test.selectQueue.push([{ id: 'u1', firstName: 'Alice' }]);
		const map = await getCreatorFirstNames(['u1', 'u-gone']);
		expect(map.has('u1')).toBe(true);
		expect(map.has('u-gone')).toBe(false);
	});
});
