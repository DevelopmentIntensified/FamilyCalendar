import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DateTime } from 'luxon';
import {
	advanceCursor,
	needsOverduePin,
	TASK_FREQUENCIES,
	getMyTasks,
	getPendingAssignments,
	getRequestedByMe,
	getPublicTasksForFamily,
	getFamilyTasksAssignedTo,
	getTasksForUser,
	getTasksForFamily,
	canMutateTask,
	canChangeVisibility
} from './tasks';

/**
 * Task scoping (issue 019): the section queries and permission rules hit
 * `db`, so the drizzle query-builder is replaced with the scripted stub
 * used by the other action tests (families.test.ts pattern) — including
 * capturing each select's where-condition so the scoping contract can be
 * asserted against the compiled SQL markers.
 */
interface StubState {
	/** Rows returned by successive select calls (scripted, untyped). */ queue: unknown[][];
	/** First argument of each select's where() call, in call order. */
	capturedWhere: SqlFragment[];
	/** On-condition (2nd arg) of each join call, in call order. */
	capturedJoins: SqlFragment[];
}

const state = vi.hoisted(
	(): StubState => ({
		queue: [],
		capturedWhere: [],
		capturedJoins: []
	})
);

/** The slice of the drizzle select-builder the scoping queries walk. */
interface StubQuery {
	from(): StubQuery;
	leftJoin(table: string, on: SqlFragment): StubQuery;
	innerJoin(table: string, on: SqlFragment): StubQuery;
	where(cond: SqlFragment): Promise<unknown[]> & { orderBy(): Promise<unknown[]> };
}

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted drizzle stub pins query shapes; real-Postgres harness tracked in docs/issues/002.
vi.mock('$lib/server/db', () => {
	const node = (): StubQuery => {
		const n: StubQuery = {
			from: () => n,
			// SAFETY: the stub stores the drizzle join/where condition it was
			// handed; only its SQL markers are read in the asserts below.
			leftJoin: (_table: string, on: SqlFragment) => {
				if (on !== undefined) state.capturedJoins.push(on);
				return n;
			},
			innerJoin: (_table: string, on: SqlFragment) => {
				if (on !== undefined) state.capturedJoins.push(on);
				return n;
			},
			where: (cond: SqlFragment) => {
				state.capturedWhere.push(cond);
				const rows = state.queue.shift() ?? [];
				return Object.assign(Promise.resolve(rows), {
					orderBy: () => Promise.resolve(rows)
				});
			}
		};
		return n;
	};
	return {
		db: {
			select: () => node()
		}
	};
});

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

/** True when the fragment is a drizzle SQL/chunk object (non-string, non-array). */
function isSqlChunk(v: SqlFragment): v is SqlChunk {
	return !isStringFragment(v) && !Array.isArray(v) && typeof v === 'object' && v !== null;
}

/**
 * Flatten a drizzle SQL condition into string markers: quoted column names
 * (chunk `name`) and bound parameter values (chunk `value`).
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
	if (isSqlChunk(fragment)) {
		for (const key of ['name', 'value', 'queryChunks'] as const) {
			const part = fragment[key];
			if (part !== undefined) collectMarkers(part, acc);
		}
	}
	return acc;
}

/** Markers of a captured where-condition, lowercased for readable asserts. */
function whereMarkers(where: SqlFragment): string[] {
	return collectMarkers(where).map((m) => m.toLowerCase());
}

const NOW = '2026-08-22T18:00:00.000Z'; // Saturday evening UTC

function iso(s: string): string {
	return DateTime.fromISO(s).toISO()!;
}

describe('advanceCursor (Recurring Task cursor v3)', () => {
	it('early check advances from today by one interval when it lands past the due date', () => {
		// Due Fri Aug 21, checked Wed Aug 19: today + 1 week (Aug 26) is past due.
		const wed = iso('2026-08-19T12:00:00Z'); // Wednesday
		const friDue = iso('2026-08-21T23:59:00Z');
		const next = DateTime.fromISO(advanceCursor(friDue, 'weekly', 1, wed));
		expect(next.toISODate()).toBe('2026-08-26');
	});

	it('due exactly one interval out takes two intervals', () => {
		const fri = iso('2026-08-21T12:00:00Z'); // today
		const nextFriDue = iso('2026-08-28T12:00:00Z'); // exactly +1 week
		const next = DateTime.fromISO(advanceCursor(nextFriDue, 'weekly', 1, fri));
		expect(next.toISODate()).toBe(iso('2026-09-04T12:00:00Z').slice(0, 10));
	});

	it('due partway into the second interval skips past it', () => {
		// Daily every 2 days: due +3 days out needs today + 4 days.
		const today = iso('2026-08-22T12:00:00Z');
		const due = iso('2026-08-25T12:00:00Z');
		const next = DateTime.fromISO(advanceCursor(due, 'daily', 2, today));
		expect(next.toISODate()).toBe('2026-08-26');
	});

	it('late/pinned completion slides from today', () => {
		const overduePinned = iso('2026-08-22T23:59:00Z');
		const next = DateTime.fromISO(advanceCursor(overduePinned, 'weekly', 1, NOW));
		expect(next.toISODate()).toBe(iso('2026-08-29T23:59:00Z').slice(0, 10));
	});

	it('honors multi-step intervals', () => {
		const next = DateTime.fromISO(advanceCursor(iso('2026-08-03T12:00:00Z'), 'monthly', 3, NOW));
		expect(next.month).toBe(11);
	});

	it('anchors at the completion day, not the due weekday (monthly)', () => {
		const next = DateTime.fromISO(
			advanceCursor(iso('2026-01-31T12:00:00Z'), 'monthly', 1, '2026-01-15T12:00:00Z')
		);
		expect(next.month).toBe(2);
		expect(next.day).toBe(15);
	});

	it('null due anchors at today + interval', () => {
		const next = DateTime.fromISO(advanceCursor(null, 'daily', 1, NOW));
		expect(next.toISODate()).toBe(DateTime.fromISO(NOW).plus({ days: 1 }).toISODate());
	});

	it('treats non-positive intervals as one step', () => {
		const a = DateTime.fromISO(advanceCursor(iso('2026-09-01T00:00:00Z'), 'weekly', 0, NOW));
		const b = DateTime.fromISO(advanceCursor(iso('2026-09-01T00:00:00Z'), 'weekly', 1, NOW));
		expect(a.toISODate()).toBe(b.toISODate());
	});

	it('accepts a JS Date as dueIso (postgres.js driver shape)', () => {
		const dueStr = iso('2026-08-21T23:59:00Z');
		const asString = advanceCursor(dueStr, 'weekly', 1, NOW);
		// Driver can hand back Date objects despite mode:'string'.
		const asDate = advanceCursor(new Date(dueStr), 'weekly', 1, NOW);
		expect(asDate).toBe(asString);
	});

	it('exposes the supported frequency set', () => {
		expect(TASK_FREQUENCIES).toEqual(['daily', 'weekly', 'monthly', 'yearly']);
	});
});

describe('needsOverduePin (sticky overdue)', () => {
	it('pins strictly-before-today dues', () => {
		expect(needsOverduePin(iso('2026-08-21T23:59:00Z'), NOW)).toBe(true);
	});

	it('does not pin today-end or future dues', () => {
		expect(needsOverduePin(iso('2026-08-22T23:59:00Z'), NOW)).toBe(false);
		expect(needsOverduePin(iso('2026-09-01T00:00:00Z'), NOW)).toBe(false);
	});

	it('never pins dateless rows', () => {
		expect(needsOverduePin(null, NOW)).toBe(false);
	});
});

/** Named shape of the section-query stub rows (owner contract, not a dictionary). */
interface SectionRow {
	id: string;
	title: string;
	visibility: string;
	assignedTo: string | null;
	assignmentStatus: string;
	userId: string;
	familyId: string | null;
	assigneeFirstName: string | null;
	assigneeLastName: string | null;
	creatorFirstName: string | null;
}

/** Base stub row for the section queries: only the mapped fields matter. */
function scopeRow(overrides: Partial<SectionRow> = {}): SectionRow {
	return {
		id: 't1',
		title: 'Water the plants',
		visibility: 'public',
		assignedTo: null,
		assignmentStatus: 'none',
		userId: 'user-a',
		familyId: null,
		assigneeFirstName: null,
		assigneeLastName: null,
		creatorFirstName: 'Ali',
		...overrides
	};
}

describe('task scoping section queries (issue 019)', () => {
	beforeEach(() => {
		state.queue = [];
		state.capturedWhere = [];
		state.capturedJoins = [];
	});

	it('getMyTasks returns my personal rows + accepted assignments with visibility and tags', async () => {
		// Select #1 = the section query; #2 = attachTags (no tags).
		state.queue = [
			[scopeRow({ id: 't-mine', visibility: 'private' }), scopeRow({ id: 't-accepted' })],
			[]
		];

		const result = await getMyTasks('user-a');

		expect(result.map((t) => [t.id, t.visibility, t.tags])).toEqual([
			['t-mine', 'private', []],
			['t-accepted', 'public', []]
		]);
		// Ownership + accepted-assignment scoping is visible in the SQL.
		const markers = whereMarkers(state.capturedWhere[0]);
		expect(markers).toContain('user_id');
		expect(markers).toContain('user-a');
		expect(markers).toContain('family_id');
		expect(markers).toContain('assigned_to');
		expect(markers).toContain('assignment_status');
		expect(markers).toContain('accepted');
	});

	it('getPendingAssignments scopes to rows assigned to me while pending', async () => {
		state.queue = [
			[scopeRow({ id: 't-pending', assignedTo: 'user-a', assignmentStatus: 'pending' })],
			[]
		];

		const result = await getPendingAssignments('user-a');

		expect(result.map((t) => t.id)).toEqual(['t-pending']);
		const markers = whereMarkers(state.capturedWhere[0]);
		expect(markers).toContain('assigned_to');
		expect(markers).toContain('user-a');
		expect(markers).toContain('assignment_status');
		expect(markers).toContain('pending');
	});

	it('getRequestedByMe scopes to my rows with an assignee in any status', async () => {
		state.queue = [
			[scopeRow({ id: 't-out', assignedTo: 'user-b', assignmentStatus: 'pending' })],
			[]
		];

		const result = await getRequestedByMe('user-a');

		expect(result.map((t) => t.id)).toEqual(['t-out']);
		const markers = whereMarkers(state.capturedWhere[0]);
		expect(markers).toContain('user_id');
		expect(markers).toContain('user-a');
		expect(markers.join(' ')).toContain('not null');
	});

	it('getPublicTasksForFamily returns only public personal rows whose creator is in the family', async () => {
		state.queue = [[scopeRow({ id: 't-pub', visibility: 'public', creatorFirstName: 'Ali' })], []];

		const result = await getPublicTasksForFamily('fam-1');

		expect(result.map((t) => [t.id, t.visibility, t.creatorFirstName])).toEqual([
			['t-pub', 'public', 'Ali']
		]);
		const markers = whereMarkers(state.capturedWhere[0]);
		expect(markers).toContain('visibility');
		expect(markers).toContain('public');
		expect(markers).toContain('family_id');
		// The creator-membership join carries the family id.
		const joinMarkers = state.capturedJoins.flatMap((j) => whereMarkers(j));
		expect(joinMarkers).toContain('family_id');
		expect(joinMarkers).toContain('fam-1');
	});

	it('getFamilyTasksAssignedTo scopes to family tasks assigned to me in the given family', async () => {
		state.queue = [[scopeRow({ id: 't-fam', familyId: 'fam-1', assignedTo: 'user-a' })], []];

		const result = await getFamilyTasksAssignedTo('user-a', 'fam-1');

		expect(result.map((t) => t.id)).toEqual(['t-fam']);
		const markers = whereMarkers(state.capturedWhere[0]);
		expect(markers).toContain('family_id');
		expect(markers).toContain('fam-1');
		expect(markers).toContain('assigned_to');
		expect(markers).toContain('user-a');
	});

	it('getTasksForUser and getTasksForFamily expose visibility on rows', async () => {
		state.queue = [[scopeRow({ id: 't-u', visibility: 'private' })], []];
		expect((await getTasksForUser('user-a')).map((t) => [t.id, t.visibility])).toEqual([
			['t-u', 'private']
		]);

		state.queue = [[scopeRow({ id: 't-f', visibility: 'public' })], []];
		expect((await getTasksForFamily('fam-1')).map((t) => [t.id, t.visibility])).toEqual([
			['t-f', 'public']
		]);
	});
});

describe('canMutateTask — task scoping (issue 019)', () => {
	/** Full Task-shaped stub row (named contract — no casts at call sites). */
	interface StubTask {
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
		visibility: string;
		userId: string;
		familyId: string | null;
		eventId: string | null;
		createdAt: Date;
	}

	function personalTask(overrides: Partial<StubTask> = {}): StubTask {
		return {
			id: 't1',
			title: 'Water the plants',
			notes: null,
			dueDate: null,
			completedAt: null,
			archivedAt: null,
			recurrenceFrequency: null,
			recurrenceInterval: null,
			completionCount: 0,
			assignedTo: null,
			assignmentStatus: 'none',
			priority: 'normal',
			visibility: 'public',
			userId: 'user-a',
			familyId: null,
			eventId: null,
			createdAt: new Date(),
			...overrides
		};
	}

	beforeEach(() => {
		state.queue = [];
		state.capturedWhere = [];
	});

	it('lets the owner mutate their personal task without a DB lookup', async () => {
		expect(await canMutateTask(personalTask(), 'user-a')).toBe(true);
		expect(state.capturedWhere).toEqual([]);
	});

	it('lets the current assignee (pending) mutate a personal task', async () => {
		const task = personalTask({
			userId: 'user-b',
			assignedTo: 'user-a',
			assignmentStatus: 'pending'
		});
		expect(await canMutateTask(task, 'user-a')).toBe(true);
		expect(state.capturedWhere).toEqual([]);
	});

	it('lets the current assignee (accepted) mutate a personal task', async () => {
		const task = personalTask({
			userId: 'user-b',
			assignedTo: 'user-a',
			assignmentStatus: 'accepted'
		});
		expect(await canMutateTask(task, 'user-a')).toBe(true);
	});

	it('denies a stale assignee row (no pending/accepted status)', async () => {
		const task = personalTask({ userId: 'user-b', assignedTo: 'user-a', assignmentStatus: 'none' });
		expect(await canMutateTask(task, 'user-a')).toBe(false);
	});

	it('denies other family members on a PUBLIC personal task (read-only visibility)', async () => {
		const task = personalTask({ userId: 'user-b', visibility: 'public' });
		// No family on the task → no membership lookup may even be attempted.
		expect(await canMutateTask(task, 'user-c')).toBe(false);
		expect(state.capturedWhere).toEqual([]);
	});

	it('keeps family-member write access on family tasks', async () => {
		const task = personalTask({ userId: 'user-b', familyId: 'fam-1' });
		state.queue = [[{ familyId: 'fam-1' }]];
		expect(await canMutateTask(task, 'user-c')).toBe(true);
	});
});

describe('canChangeVisibility (issue 019)', () => {
	it('grants the owner only', () => {
		const task = { userId: 'user-a', assignedTo: 'user-b', familyId: 'fam-1' };
		expect(canChangeVisibility(task, 'user-a')).toBe(true);
		expect(canChangeVisibility(task, 'user-b')).toBe(false);
	});
});
