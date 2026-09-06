import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Task } from '$lib/server/db/schema';

/**
 * undoRecurringCompletion reverses a Recurring Task check-off: it restores
 * the previous due date, decrements the completion tally, and removes the
 * matching taskCompletions history row (so streaks/stats don't count an
 * undone completion). The client-supplied previousDueDate is only a hint —
 * it must be strictly before the current due date, otherwise the previous
 * cursor is derived server-side from the completion row. Task update +
 * history delete run in ONE transaction.
 */
/** A stubbed DB row: plain JSON-ish values only. */
type Row = Record<string, string | number | boolean | null | Date>;

interface StubState {
	/** Rows returned by successive selects (task lookup, then tx selects). */
	queue: Row[][];
	/** Patch of the most recent (tx) update call. */
	updatePatch: Row | null;
	/** Rows returned by the tx update's returning(). */
	updateResult: Row | null;
	/** Markers of the tx delete's where condition. */
	deleteMarkers: string[];
	/** How many transactions were opened. */
	txCount: number;
}

const state = vi.hoisted(
	(): StubState => ({
		queue: [],
		updatePatch: null,
		updateResult: null,
		deleteMarkers: [],
		txCount: 0
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

/** The slice of the drizzle transaction client the undo path uses. */
interface TxStub {
	select(): {
		from(): {
			where(): Promise<Row[]> & { orderBy(): { limit(): Promise<Row[]> } };
		};
	};
	update(): {
		set(patch: Row): { where(): { returning(): Promise<Row[]> } };
	};
	delete(): {
		where(...args: unknown[]): Promise<void>;
	};
}

function makeExecutor(): TxStub {
	return {
		select: () => ({
			from: () => ({
				where: () => {
					const rows = state.queue.shift() ?? [];
					// Promise + chained orderBy so await and .orderBy().limit() both resolve.
					return Object.assign(Promise.resolve(rows), {
						orderBy: () => ({ limit: () => Promise.resolve(rows) })
					});
				}
			})
		}),
		update: () => ({
			set: (patch: Row) => {
				state.updatePatch = patch;
				return {
					where: () => ({
						returning: () => Promise.resolve(state.updateResult ? [state.updateResult] : [])
					})
				};
			}
		}),
		delete: () => ({
			where: (...args: unknown[]) => {
				const condition = args[0];
				if (!isWalkableCondition(condition)) {
					throw new Error('expected a delete where condition');
				}
				state.deleteMarkers = collectMarkers(condition);
				return Promise.resolve();
			}
		})
	};
}

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted drizzle stub pins query shapes; real-Postgres harness tracked in docs/issues/002.
vi.mock('$lib/server/db', () => ({
	db: {
		...makeExecutor(),
		transaction: async (run: (tx: TxStub) => Promise<Task | null>) => {
			state.txCount += 1;
			return await run(makeExecutor());
		}
	}
}));

import { undoRecurringCompletion } from './tasks';

/** Base row for a daily recurring Task under test. */
type TaskRow = {
	id: string;
	title: string;
	notes: string | null;
	dueDate: string | null;
	completedAt: string | null;
	archivedAt: string | null;
	recurrenceFrequency: string | null;
	recurrenceInterval: number | null;
	completionCount: number;
	assignedTo: string | null;
	assignmentStatus: string;
	priority: string;
	userId: string;
	familyId: string | null;
	eventId: string | null;
	createdAt: Date;
};

function recurringTask(overrides: Partial<TaskRow> = {}): TaskRow {
	return {
		id: 't1',
		title: 'Water the plants',
		notes: null,
		dueDate: '2026-09-02T00:00:00.000Z',
		completedAt: null,
		archivedAt: null,
		recurrenceFrequency: 'daily',
		recurrenceInterval: 1,
		completionCount: 5,
		assignedTo: null,
		assignmentStatus: 'none',
		priority: 'normal',
		userId: 'user-a',
		familyId: null,
		eventId: null,
		createdAt: new Date(),
		...overrides
	};
}

beforeEach(() => {
	state.queue = [];
	state.updatePatch = null;
	state.updateResult = null;
	state.deleteMarkers = [];
	state.txCount = 0;
});

describe('undoRecurringCompletion', () => {
	it('returns null when the task is missing or not the caller’s — no transaction opened', async () => {
		state.queue = [[]];
		expect(
			await undoRecurringCompletion('missing', 'user-a', '2026-08-28T23:59:00.000Z')
		).toBeNull();
		expect(state.txCount).toBe(0);
		expect(state.updatePatch).toBeNull();
	});

	it('returns null for non-recurring tasks — only recurring check-offs are undoable', async () => {
		state.queue = [[recurringTask({ recurrenceFrequency: null, recurrenceInterval: null })]];
		expect(await undoRecurringCompletion('t1', 'user-a', '2026-08-28T23:59:00.000Z')).toBeNull();
		expect(state.updatePatch).toBeNull();
	});

	it('accepts a client previousDueDate only when it is strictly before the current due date', async () => {
		const task = recurringTask();
		state.queue = [[task], [{ id: 'comp-1', completedAt: '2026-09-01T10:00:00.000Z' }]];
		const prevDue = '2026-08-31T23:59:00.000Z';
		state.updateResult = { ...task, dueDate: prevDue, completionCount: 4 };

		const result = await undoRecurringCompletion('t1', 'user-a', prevDue);

		expect(result).not.toBeNull();
		expect(result!.dueDate).toBe(prevDue);
		// Compare instants — toISO() renders the system zone in this repo.
		expect(Date.parse(String(state.updatePatch!.dueDate))).toBe(Date.parse(prevDue));
		expect(state.updatePatch).toHaveProperty('completionCount');
	});

	it('rejects a client cursor at/after the current due date and derives the previous cursor server-side', async () => {
		// Client claims the previous cursor is the CURRENT due date — not a
		// strictly-earlier cursor, so it is discarded. The server derives the
		// previous cursor from the completion row (completedAt anchors the
		// cursor-v3 rewind): due Sep 2 minus one daily interval = Sep 1.
		const task = recurringTask({ dueDate: '2026-09-02T00:00:00.000Z' });
		state.queue = [[task], [{ id: 'comp-1', completedAt: '2026-09-01T15:00:00.000Z' }]];
		state.updateResult = { ...task, dueDate: '2026-09-01T00:00:00.000Z', completionCount: 4 };

		const result = await undoRecurringCompletion('t1', 'user-a', '2026-09-02T00:00:00.000Z');

		expect(result).not.toBeNull();
		// Derived = due minus one daily interval; compare instants.
		expect(Date.parse(String(state.updatePatch!.dueDate))).toBe(
			Date.parse('2026-09-01T00:00:00.000Z')
		);
	});

	it('derives the previous cursor when the client sends null or garbage', async () => {
		const task = recurringTask({ dueDate: '2026-09-02T00:00:00.000Z' });
		state.queue = [[task], [{ id: 'comp-1', completedAt: '2026-09-01T15:00:00.000Z' }]];
		state.updateResult = { ...task, dueDate: '2026-09-01T00:00:00.000Z', completionCount: 4 };

		for (const bogus of [null, 'not-a-date', '2099-01-01T00:00:00.000Z']) {
			// Each call consumes the task + completion selects; requeue per case.
			state.queue = [[task], [{ id: 'comp-1', completedAt: '2026-09-01T15:00:00.000Z' }]];
			state.updatePatch = null;
			// SAFETY: the union only holds strings; null is the "no hint" case.
			await undoRecurringCompletion('t1', 'user-a', bogus as string | null);
			expect(Date.parse(String(state.updatePatch!.dueDate))).toBe(
				Date.parse('2026-09-01T00:00:00.000Z')
			);
		}
	});

	it('runs the task update and the history delete in ONE transaction', async () => {
		const task = recurringTask();
		state.queue = [[task], [{ id: 'comp-1', completedAt: '2026-09-01T10:00:00.000Z' }]];
		state.updateResult = { ...task, dueDate: '2026-08-31T23:59:00.000Z', completionCount: 4 };

		await undoRecurringCompletion('t1', 'user-a', '2026-08-31T23:59:00.000Z');

		expect(state.txCount).toBe(1);
		expect(state.deleteMarkers).toContain('comp-1');
	});

	it('is a no-op when the tally is already at zero (double-undo guard)', async () => {
		const task = recurringTask({ completionCount: 0 });
		state.queue = [[task], [{ id: 'comp-1', completedAt: '2026-09-01T10:00:00.000Z' }]];
		state.updateResult = null; // guarded update matches nothing

		const result = await undoRecurringCompletion('t1', 'user-a', '2026-08-31T23:59:00.000Z');

		expect(result).toBeNull();
		expect(state.deleteMarkers).toEqual([]);
	});
});
