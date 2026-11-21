/**
 * The access predicates, carried from
 * `src/lib/server/db/actions/calendarScope.test.ts:135-230` (#098 reads, #165
 * owner leg, `canTouchEvent`'s three outcomes) and the bulk dedupe.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import {
	canMutateEventRow,
	eventTouchDecision,
	isEventVisibleTo,
	masterIdsIn
} from './calendar.scope.rules';

describe('isEventVisibleTo (calendarScope.test.ts:135-170, #098)', () => {
	it.each([
		['the owner, with no calendars', { ownerId: 'user-1', calendarId: 'c-personal' }, 'user-1', [], true],
		['a reader of the calendar it sits on', { ownerId: 'user-2', calendarId: 'c-family' }, 'user-1', ['c-family'], true],
		['a reader of another calendar only', { ownerId: 'user-2', calendarId: 'c-family' }, 'user-1', ['c-personal'], false],
		['the owner of a hollow row', { ownerId: 'user-1', calendarId: null }, 'user-1', [], true],
		['a stranger on a hollow row', { ownerId: 'user-2', calendarId: null }, 'user-1', ['c-personal'], false]
	] satisfies [string, { ownerId: string; calendarId: string | null }, string, string[], boolean][])(
		'%s',
		(_name, row, userId, accessibleCalendarIds, expected) => {
			expect(isEventVisibleTo(row, userId, accessibleCalendarIds)).toBe(expected);
		}
	);
});

describe('canMutateEventRow (calendarScope.test.ts:200-230, #165)', () => {
	it.each([
		['allows the event owner', { ownerId: 'user-1', calendarId: 'cal-fam' }, 'user-1', [], true],
		['allows the owner of the calendar the event sits on', { ownerId: 'member-2', calendarId: 'cal-fam' }, 'user-1', ['cal-fam'], true],
		['blocks a member who owns neither', { ownerId: 'member-2', calendarId: 'cal-fam' }, 'user-1', ['cal-other'], false],
		['blocks on a hollow event row regardless of owned calendars', { ownerId: 'user-2', calendarId: null }, 'user-1', ['cal-a', 'cal-b'], false]
	] satisfies [string, { ownerId: string; calendarId: string | null }, string, string[], boolean][])(
		'%s',
		(_name, row, userId, ownedCalendarIds, expected) => {
			expect(canMutateEventRow(row, userId, ownedCalendarIds)).toBe(expected);
		}
	);
});

describe('eventTouchDecision (calendarScope.test.ts:150-195)', () => {
	const sharedRow = { ownerId: 'member-2', calendarId: 'cal-fam' };

	it.each([
		['not-found when there is no row', null, 'user-1', [], 'not-found'],
		['not-found for an undefined row', undefined, 'user-1', [], 'not-found'],
		['allowed for the owner regardless of membership', { ownerId: 'user-1', calendarId: 'c-personal' }, 'user-1', [], 'allowed'],
		['allowed for a reader of the calendar it sits on', sharedRow, 'user-1', ['cal-fam'], 'allowed'],
		['forbidden when neither leg holds', sharedRow, 'user-1', ['c-personal'], 'forbidden'],
		['forbidden when the event has no calendar', { ownerId: 'user-2', calendarId: null }, 'user-1', ['c-personal'], 'forbidden']
	] satisfies [string, { ownerId: string; calendarId: string | null } | null | undefined, string, string[], string][])(
		'%s',
		(_name, row, userId, accessibleCalendarIds, expected) => {
			expect(eventTouchDecision(row, userId, accessibleCalendarIds)).toBe(expected);
		}
	);
});

describe('masterIdsIn (bulk dedupe)', () => {
	it('resolves composites, drops junk and keeps first-seen order', () => {
		expect(
			masterIdsIn([
				{ id: 'evtoneoff01~2026-10-05T09:00:00.000Z' },
				{ id: 'evtoneoff01' },
				{ id: '' },
				{ id: 'x' },
				{ id: 'evtoneoff02' }
			])
		).toEqual(['evtoneoff01', 'evtoneoff02']);
	});

	it('drops a malformed or missing id and keeps nothing for an empty list', () => {
		expect(masterIdsIn([{ id: null }, { id: undefined }, { id: '' }, {}])).toEqual([]);
		expect(masterIdsIn([])).toEqual([]);
	});
});
