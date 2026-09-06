import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Day Dashboard data-retrieval functions: the drizzle query-builder is
 * replaced with a scripted stub (same pattern as calendar.test.ts /
 * advanceTaskToNext.test.ts) so the gating/empty-decision logic of each
 * retrieval is verified without a live database.
 *
 * These are thin, named retrievals that the Day Dashboard route composes in
 * place of inline raw `db` calls; tests pin the query shape so the extracted
 * functions stay exactly equivalent to the queries they replaced.
 */
/** A stubbed DB row: plain JSON-ish values only. */
type Row = Record<string, string | number | boolean | null | Date>;

interface StubState {
	selectQueue: Row[][];
	/** First argument of each select's where() call, in call order. */
	capturedWhere: unknown[];
}

const state = vi.hoisted(
	(): StubState => ({
		// Each entry is the rows a `.where()` (or `.orderBy().limit()`) resolves to,
		// in call order.
		selectQueue: [],
		capturedWhere: []
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
			from: () => {
				const query = {
					// Promise + chained orderBy (with/without limit): getCompletionTimestamps
					// uses orderBy+limit, getRecurringDayCompletions uses orderBy.
					where: (...args: unknown[]) => {
						state.capturedWhere.push(args[0]);
						const rows = state.selectQueue.shift() ?? [];
						return Object.assign(Promise.resolve(rows), {
							orderBy: () =>
								Object.assign(Promise.resolve(rows), {
									limit: () => Promise.resolve(rows)
								})
						});
					}
				};
				return {
					where: query.where,
					innerJoin: () => query
				};
			}
		})
	}
}));

import {
	getUserDayCalendar,
	getFamilyDayEvents,
	getFamilyAttendanceForEvents,
	getKidsScheduleAttendance,
	getCompletionTimestamps,
	getRecurringDayCompletions,
	mergeDayCompletions
} from './dashboard';

beforeEach(() => {
	state.selectQueue = [];
	state.capturedWhere = [];
});

describe('getUserDayCalendar', () => {
	it('returns the user’s personal events when a Personal Calendar exists', async () => {
		const userCal = { id: 'cal-own', ownerId: 'u1', familyId: null, createdAt: 'x' };
		const evt = { id: 'evt-1', calendarId: 'cal-own' };
		state.selectQueue = [[userCal], [evt]];

		const result = await getUserDayCalendar('u1');

		expect(result.calendar).toEqual(userCal);
		expect(result.events).toEqual([evt]);
		expect(state.selectQueue).toEqual([]);
	});

	it('returns empty events when the user has no Personal Calendar', async () => {
		state.selectQueue = [[]]; // no personal calendar row

		const result = await getUserDayCalendar('u1');

		expect(result.calendar).toBeNull();
		expect(result.events).toEqual([]);
		// No second query (events) was driven for the no-calendar case.
		expect(state.selectQueue).toEqual([]);
	});
});

describe('getFamilyDayEvents', () => {
	it('returns family events when a Family Calendar exists', async () => {
		const familyCal = { id: 'cal-family', familyId: 'f1', ownerId: null, createdAt: 'x' };
		const evt = { id: 'evt-family', calendarId: 'cal-family' };
		state.selectQueue = [[familyCal], [evt]];

		const result = await getFamilyDayEvents('f1');

		expect(result).toEqual([evt]);
		expect(state.selectQueue).toEqual([]);
	});

	it('returns empty when there is no Family Calendar', async () => {
		state.selectQueue = [[]]; // no family calendar row

		const result = await getFamilyDayEvents('f1');

		expect(result).toEqual([]);
		// No second query driven once the family calendar is absent.
		expect(state.selectQueue).toEqual([]);
	});
});

describe('getFamilyAttendanceForEvents', () => {
	it('returns the attendance userId rows for the family event ids', async () => {
		const rows = [{ userId: 'u1' }, { userId: 'u2' }, { userId: null }];
		state.selectQueue = [rows];

		const result = await getFamilyAttendanceForEvents(['evt-1', 'evt-2']);

		expect(result).toEqual(rows);
		expect(state.selectQueue).toEqual([]);
	});

	it('returns empty when run against no event ids (guarded by caller before calling)', async () => {
		state.selectQueue = [[]];
		const result = await getFamilyAttendanceForEvents([]);
		expect(result).toEqual([]);
	});
});

describe('getKidsScheduleAttendance', () => {
	it('returns child-attendance rows keyed by event + user', async () => {
		const rows = [{ eventId: 'evt-1', userId: 'kid-1' }];
		state.selectQueue = [rows];

		const result = await getKidsScheduleAttendance(['evt-1'], ['kid-1']);

		expect(result).toEqual(rows);
		expect(state.selectQueue).toEqual([]);
	});
});

describe('getCompletionTimestamps', () => {
	it('returns completion timestamps newest-first from the orderBy/limit chain', async () => {
		const rows = [
			{ completedAt: '2026-09-01T00:00:00.000Z' },
			{ completedAt: '2026-08-01T00:00:00.000Z' }
		];
		state.selectQueue = [rows];

		const result = await getCompletionTimestamps('u1');

		expect(result).toEqual(rows);
		expect(state.selectQueue).toEqual([]);
	});

	it('returns empty when the user has no completions', async () => {
		state.selectQueue = [[]];
		expect(await getCompletionTimestamps('u1')).toEqual([]);
	});

	it('attributes completions to the actor leg with a legacy userId fallback', async () => {
		// Rows written since the actorId column carry the ACTING user; older
		// rows only have the owner in userId. Both legs must be queried.
		state.selectQueue = [[]];
		await getCompletionTimestamps('u1');

		const markers = lastWhereMarkers();
		expect(markers).toContain('actorId');
		expect(markers).toContain('userId');
		expect(markers).toContain('u1');
	});
});

describe('getRecurringDayCompletions', () => {
	it('returns recurring check-offs within the day window, newest first', async () => {
		const rows = [
			{ id: 'c2', title: 'Water plants', completedAt: '2026-09-04 09:00:00+00' },
			{ id: 'c1', title: 'Take out trash', completedAt: '2026-09-04 07:30:00+00' }
		];
		state.selectQueue = [rows];

		const dayStart = new Date('2026-09-04T00:00:00.000Z');
		const dayEnd = new Date('2026-09-05T00:00:00.000Z');
		const result = await getRecurringDayCompletions('u1', dayStart, dayEnd);

		expect(result).toEqual([
			{ id: 'c2', title: 'Water plants', completedAt: '2026-09-04T09:00:00.000Z' },
			{ id: 'c1', title: 'Take out trash', completedAt: '2026-09-04T07:30:00.000Z' }
		]);
		expect(state.selectQueue).toEqual([]);
	});

	it('returns empty when no recurring check-offs landed that day', async () => {
		state.selectQueue = [[]];
		const dayStart = new Date('2026-09-04T00:00:00.000Z');
		const dayEnd = new Date('2026-09-05T00:00:00.000Z');
		expect(await getRecurringDayCompletions('u1', dayStart, dayEnd)).toEqual([]);
		expect(state.selectQueue).toEqual([]);
	});

	it('attributes recurring check-offs to the actor leg with a legacy userId fallback', async () => {
		state.selectQueue = [[]];
		const dayStart = new Date('2026-09-04T00:00:00.000Z');
		const dayEnd = new Date('2026-09-05T00:00:00.000Z');
		await getRecurringDayCompletions('u1', dayStart, dayEnd);

		const markers = lastWhereMarkers();
		expect(markers).toContain('actorId');
		expect(markers).toContain('userId');
		expect(markers).toContain('u1');
	});
});

describe('mergeDayCompletions', () => {
	it('combines one-off and recurring completions, newest first', () => {
		const oneOff = [{ id: 't1', title: 'Sweep floor', completedAt: '2026-09-04T08:00:00.000Z' }];
		const recurring = [
			{ id: 'c2', title: 'Water plants', completedAt: '2026-09-04T09:00:00.000Z' },
			{ id: 'c1', title: 'Take out trash', completedAt: '2026-09-04T07:30:00.000Z' }
		];

		expect(mergeDayCompletions(oneOff, recurring)).toEqual([recurring[0], oneOff[0], recurring[1]]);
	});

	it('keeps null completedAt entries last', () => {
		expect(
			mergeDayCompletions(
				[{ id: 't1', title: 'No time', completedAt: null }],
				[{ id: 'c1', title: 'Done', completedAt: '2026-09-04T09:00:00.000Z' }]
			)
		).toEqual([
			{ id: 'c1', title: 'Done', completedAt: '2026-09-04T09:00:00.000Z' },
			{ id: 't1', title: 'No time', completedAt: null }
		]);
	});
});
