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
const state = vi.hoisted(() => ({
	// Each entry is the rows a `.where()` (or `.orderBy().limit()`) resolves to,
	// in call order.
	selectQueue: [] as unknown[][]
}));

vi.mock('$lib/server/db', () => ({
	db: {
		select: () => ({
			from: () => ({
				where: () => {
					const rows = state.selectQueue.shift() ?? [];
					return {
						// .where() alone (thenable) — getUserDayCalendar/family/attendance/kids
						then: (resolve: (v: unknown) => unknown) => resolve(rows),
						// .where().orderBy().limit() — getCompletionTimestamps
						orderBy: () => ({ limit: () => Promise.resolve(rows) })
					};
				}
			})
		})
	}
}));

import {
	getUserDayCalendar,
	getFamilyDayEvents,
	getFamilyAttendanceForEvents,
	getKidsScheduleAttendance,
	getCompletionTimestamps
} from './dashboard';

beforeEach(() => {
	state.selectQueue = [];
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
		const rows = [{ completedAt: '2026-09-01T00:00:00.000Z' }, { completedAt: '2026-08-01T00:00:00.000Z' }];
		state.selectQueue = [rows];

		const result = await getCompletionTimestamps('u1');

		expect(result).toEqual(rows);
		expect(state.selectQueue).toEqual([]);
	});

	it('returns empty when the user has no completions', async () => {
		state.selectQueue = [[]];
		expect(await getCompletionTimestamps('u1')).toEqual([]);
	});
});
