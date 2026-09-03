import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * calendarScope owns the read/write scope for Events: "a user may touch an
 * Event if they own it OR its Calendar is in their accessible set (personal
 * + first family)". getAccessibleCalendarIds and canTouchEvent hit `db`, so
 * the drizzle query-builder is replaced with the scripted stub used by the
 * other action tests; eventAccessFilter is a pure SQL fragment and is
 * verified directly.
 */
const state = vi.hoisted(() => ({
	queue: [] as unknown[][]
}));

vi.mock('$lib/server/db', () => ({
	db: {
		select: () => ({
			from: () => ({
				where: () => {
					const rows = state.queue.shift() ?? [];
					return {
						// thenable so `await select...where` resolves to rows
						then: (resolve: (v: unknown) => unknown) => {
							resolve(rows);
						},
						// chain for `select(...).from(...).where(...).limit(1)`
						limit: () => Promise.resolve(rows)
					};
				}
			})
		})
	}
}));

import { getAccessibleCalendarIds, eventAccessFilter, canTouchEvent } from './calendarScope';

beforeEach(() => {
	state.queue = [];
});

/**
 * Flatten a drizzle-orm 0.38 SQL fragment into stable markers we can assert
 * on: the quoted column names it references (e.g. "owner_id"). `getSQL()`
 * returns a nested SQL object, not a string, so we walk the wrapper's
 * `queryChunks` arrays (capturing each column's `name`) rather than
 * stringifying. We deliberately never recurse into `getSQL()` of children —
 * only through `queryChunks` — to avoid circular column references.
 */
function flattenSql(fragment: unknown, acc: string[] = []): string[] {
	if (typeof fragment === 'string') {
		return acc;
	}
	if (Array.isArray(fragment)) {
		for (const c of fragment) flattenSql(c, acc);
		return acc;
	}
	const f = fragment as Record<string, unknown> | null | undefined;
	if (!f || typeof f !== 'object') return acc;
	if (Array.isArray(f.queryChunks)) {
		flattenSql(f.queryChunks, acc);
	}
	// drizzle column wrapper: { name, table } — capture the SQL column name.
	if (typeof f.name === 'string') acc.push(f.name);
	return acc;
}

function eventAccessMarkers(calIds: string[]): string[] {
	return flattenSql(eventAccessFilter('user-1', calIds).getSQL());
}

describe('eventAccessFilter (pure SQL fragment)', () => {
	it('grants access when the user owns the event (owner-hit)', () => {
		const markers = eventAccessMarkers(['cal-a', 'cal-b']);
		// the owner clause is always present regardless of accessible calendars
		expect(markers).toContain('owner_id');
	});

	it('allows events on any accessible calendar (calendar-hit)', () => {
		const markers = eventAccessMarkers(['cal-a', 'cal-b']);
		// `inArray(calendarId, calIds)` brings the calendar column into the fragment
		expect(markers).toContain('calendar_id');
		// and, unlike the empty-calendar case, the owner clause is still present
		expect(markers).toContain('owner_id');
	});

	it('falls back to keeping the owner clause when there are no accessible calendars (none)', () => {
		const markers = eventAccessMarkers([]);
		// the owner clause stays present; the fragment remains compilable
		expect(markers).toContain('owner_id');
		expect(eventAccessFilter('user-1', []).getSQL()).toBeTruthy();
	});
});

describe('getAccessibleCalendarIds', () => {
	it('returns personal calendars only when the user is in no family', async () => {
		// select #1 = familyMembers (no row), select #2 = calendars
		state.queue = [[], [{ id: 'c-personal' }]];
		expect(await getAccessibleCalendarIds('user-1')).toEqual(['c-personal']);
	});

	it('adds the first family calendar to the personal set', async () => {
		// select #1 = familyMembers (member of family), select #2 = calendars
		state.queue = [[{ familyId: 'fam-1' }], [{ id: 'c-personal' }, { id: 'c-family' }]];
		expect(await getAccessibleCalendarIds('user-1')).toEqual(['c-personal', 'c-family']);
	});
});

describe('canTouchEvent', () => {
	it('reports not-found when the event does not exist', async () => {
		// select #1 = events (none)
		state.queue = [[]];
		expect(await canTouchEvent('user-1', 'event-missing')).toBe('not-found');
	});

	it('allows the owner regardless of calendar membership', async () => {
		// select #1 = event (owned), #2 = familyMembers (no family), #3 = calendars
		state.queue = [
			[{ ownerId: 'user-1', calendarId: 'c-personal' }],
			[],
			[{ id: 'c-other' }]
		];
		expect(await canTouchEvent('user-1', 'event-1')).toBe('allowed');
	});

	it('allows a family member whose calendar is accessible', async () => {
		// select #1 = event (owned by someone else, on family cal), #2 = familyMembers,
		// #3 = calendars (includes the family cal)
		state.queue = [
			[{ ownerId: 'user-2', calendarId: 'c-family' }],
			[{ familyId: 'fam-1' }],
			[{ id: 'c-family' }]
		];
		expect(await canTouchEvent('user-1', 'event-1')).toBe('allowed');
	});

	it('forbids access when the event is neither owned nor on an accessible calendar', async () => {
		// select #1 = event (someone else's, on an inaccessible cal), #2 = familyMembers,
		// #3 = calendars (only the user's own)
		state.queue = [
			[{ ownerId: 'user-2', calendarId: 'c-other' }],
			[],
			[{ id: 'c-personal' }]
		];
		expect(await canTouchEvent('user-1', 'event-1')).toBe('forbidden');
	});

	it('forbids calendar access when the event has no calendar', async () => {
		// select #1 = event (someone else's, no calendar), #2 = familyMembers (no family),
		// #3 = calendars (own only)
		state.queue = [[{ ownerId: 'user-2', calendarId: null }], [], [{ id: 'c-personal' }]];
		expect(await canTouchEvent('user-1', 'event-1')).toBe('forbidden');
	});
});
