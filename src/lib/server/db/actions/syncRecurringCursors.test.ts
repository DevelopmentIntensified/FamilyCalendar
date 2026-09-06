import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * syncRecurringCursors pins overdue Recurring Task cursors to today's end.
 * Scope contract: the caller's OWN tasks PLUS — when a family is known —
 * every task in that family (an OR over family scope; the old
 * `userId AND familyId` conjunction made the family leg unreachable, so
 * other members' family-task cursors never pinned).
 */
/** A stubbed DB row: plain JSON-ish values only. */
type Row = Record<string, string | number | boolean | null | Date>;

interface StubState {
	/** Rows returned by the scope select. */
	queue: Row[][];
	/** First argument of each select's where() call. */
	capturedWhere: unknown[];
	/** Patch of the most recent update call. */
	updatePatch: Row | null;
	/** Number of update calls issued. */
	updateCount: number;
}

const state = vi.hoisted(
	(): StubState => ({
		queue: [],
		capturedWhere: [],
		updatePatch: null,
		updateCount: 0
	})
);

/** A drizzle SQL internal: string leaf, chunk array, or wrapper object. */
interface SqlChunk {
	queryChunks?: SqlFragment;
	name?: SqlFragment;
	value?: SqlFragment;
}

type SqlFragment = string | undefined | readonly SqlFragment[] | SqlChunk;

/** True when the fragment is a plain string (leaf marker or bound value). */
function isStringFragment(v: SqlFragment): v is string {
	return typeof v === 'string';
}

/** True when the fragment is a drizzle SQL condition object we can walk. */
function isWalkableCondition(v: unknown): v is SqlChunk {
	return typeof v === 'object' && v !== null;
}

/** True when the fragment is a drizzle SQL/chunk object (non-string, non-array). */
function isSqlChunk(v: SqlFragment): v is SqlChunk {
	return !isStringFragment(v) && !Array.isArray(v) && typeof v === 'object' && v !== null;
}

/**
 * Flatten a drizzle SQL condition into string markers: quoted column names
 * (chunk `name`) and bound parameter values (chunk `value`). Walks only
 * `queryChunks` arrays to avoid circular column references.
 */
function collectMarkers(fragment: SqlFragment, acc: string[] = []): string[] {
	if (isStringFragment(fragment)) {
		acc.push(fragment);
		return acc;
	}
	if (Array.isArray(fragment)) {
		for (const chunk of fragment) collectMarkers(chunk, acc);
		return acc;
	}
	if (!isSqlChunk(fragment)) return acc;
	if (isStringFragment(fragment.name)) acc.push(fragment.name);
	// StringChunk wraps its text in a one-element array; Param carries a string.
	if (isStringFragment(fragment.value)) acc.push(fragment.value);
	if (Array.isArray(fragment.value)) {
		for (const part of fragment.value) {
			if (isStringFragment(part)) acc.push(part);
		}
	}
	if (Array.isArray(fragment.queryChunks)) collectMarkers(fragment.queryChunks, acc);
	return acc;
}

/** Markers of the most recently captured where condition. */
function lastWhereMarkers(): string[] {
	const condition = state.capturedWhere[state.capturedWhere.length - 1];
	if (!isWalkableCondition(condition)) {
		throw new Error('expected a captured where condition');
	}
	return collectMarkers(condition);
}

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted drizzle stub pins query shapes; real-Postgres harness tracked in docs/issues/002.
vi.mock('$lib/server/db', () => ({
	db: {
		select: () => ({
			from: () => ({
				where: (...args: unknown[]) => {
					state.capturedWhere.push(args[0]);
					return Promise.resolve(state.queue.shift() ?? []);
				}
			})
		}),
		update: () => ({
			set: (patch: Row) => {
				state.updatePatch = patch;
				return {
					where: () => {
						state.updateCount += 1;
						return Promise.resolve();
					}
				};
			}
		})
	}
}));

import { syncRecurringCursors } from './tasks';

beforeEach(() => {
	state.queue = [];
	state.capturedWhere = [];
	state.updatePatch = null;
	state.updateCount = 0;
});

describe('syncRecurringCursors', () => {
	it('scopes to the caller AND their family when a family is known (OR, not AND)', async () => {
		state.queue = [[]];
		await syncRecurringCursors('me-1', 'fam-1');

		const markers = lastWhereMarkers();
		expect(markers).toContain('user_id');
		expect(markers).toContain('me-1');
		// The family leg must be reachable: familyId is in the same condition.
		expect(markers).toContain('family_id');
		expect(markers).toContain('fam-1');
	});

	it('stays scoped to the caller only when no family is known', async () => {
		state.queue = [[]];
		await syncRecurringCursors('me-1', null);

		const markers = lastWhereMarkers();
		expect(markers).toContain('user_id');
		expect(markers).toContain('me-1');
		expect(markers).not.toContain('family_id');
	});

	it("pins only overdue rows to today's end", async () => {
		// One overdue (yesterday) row, one current (tomorrow) row.
		state.queue = [
			[
				{ id: 'stale-1', dueDate: '2026-08-31T23:59:00.000Z' },
				{ id: 'fresh-1', dueDate: '2099-09-02T23:59:00.000Z' }
			]
		];
		await syncRecurringCursors('me-1', 'fam-1');

		expect(state.updateCount).toBe(1);
		expect(String(state.updatePatch!.dueDate)).toMatch(/T23:59:00/);
	});

	it('issues no update when nothing is overdue', async () => {
		state.queue = [[{ id: 'fresh-1', dueDate: '2099-09-02T23:59:00.000Z' }]];
		await syncRecurringCursors('me-1', null);

		expect(state.updateCount).toBe(0);
	});
});
