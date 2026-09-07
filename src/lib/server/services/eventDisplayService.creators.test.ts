import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * attachCreatorNames maps ownerIds → creator first names via the events
 * actions. The action (DB query) is stubbed; these tests pin the mapping
 * and the single-call (no N+1) behavior.
 */

const test = vi.hoisted(() => ({
	getCreatorFirstNames: vi.fn(async (ownerIds: string[]) => {
		const names = ['Alice', 'Bob'];
		return new Map(ownerIds.map((id, i) => [id, names[i] ?? `User-${id}`]));
	})
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- service seam test; DB action stubbed, spread keeps the real actions module intact.
vi.mock('$lib/server/db/actions/events', async (importOriginal) => ({
	// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- scripted capture bag; real actions spread untouched.
	...(await importOriginal<Record<string, unknown>>()),
	getCreatorFirstNames: test.getCreatorFirstNames
}));

import { attachCreatorNames } from './eventDisplayService';

beforeEach(() => {
	test.getCreatorFirstNames.mockClear();
});

describe('attachCreatorNames', () => {
	it('short-circuits without a query for an empty list', async () => {
		const out = await attachCreatorNames([]);
		expect(out).toEqual([]);
		expect(test.getCreatorFirstNames).not.toHaveBeenCalled();
	});

	it('attaches creatorName per occurrence, sharing one lookup across a series', async () => {
		const list = [
			{ masterId: 'e1', ownerId: 'u1' },
			{ masterId: 'e1~2026-09-01', ownerId: 'u1' },
			{ masterId: 'e2', ownerId: 'u2' }
		];
		const out = await attachCreatorNames(list);
		expect(out[0]).toMatchObject({ ownerId: 'u1', creatorName: 'Alice' });
		expect(out[1]).toMatchObject({ ownerId: 'u1', creatorName: 'Alice' });
		expect(out[2]).toMatchObject({ ownerId: 'u2', creatorName: 'Bob' });
		// One lookup keyed by the distinct owner set — never per-occurrence.
		expect(test.getCreatorFirstNames).toHaveBeenCalledTimes(1);
		expect(test.getCreatorFirstNames).toHaveBeenCalledWith(['u1', 'u2']);
	});

	it('omits creatorName when the owner has no users row', async () => {
		test.getCreatorFirstNames.mockResolvedValueOnce(new Map<string, string>());
		const out = await attachCreatorNames([{ masterId: 'e1', ownerId: 'u-gone' }]);
		expect(out[0].creatorName).toBeUndefined();
	});

	it('does not mutate the input list', async () => {
		const list = [{ masterId: 'e1', ownerId: 'u1' }];
		await attachCreatorNames(list);
		expect(list[0]).not.toHaveProperty('creatorName');
	});
});
