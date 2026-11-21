/**
 * Pure person-filter rules: who a row belongs to, the filter roster and its
 * counts, the per-user storage key and value codec, and the one predicate every
 * view reads. Expected values come from the legacy table
 * `src/lib/utils/calendarAssignees.test.ts` and the README Invariants, never
 * from running this code.
 *
 * Doc: ./README.md#the-reading-filters
 */
import { describe, expect, it } from 'vitest';
import {
	HIDDEN_ASSIGNEES_VERSION,
	assigneeCounts,
	assigneeRoster,
	hiddenAssigneeNames,
	hiddenAssigneesKey,
	isAssigneeHidden,
	isVisibleByAssignee,
	parseHiddenAssignees,
	serialiseHiddenAssignees,
	toggleAssigneeVisibility,
	type CalendarAssigneeEvent,
	type CalendarAssigneeTask
} from './calendarPage.people.rules';

/** An event: one person (its owner), on a calendar, unless told otherwise. */
function evt(over: Partial<CalendarAssigneeEvent> & { id: string }): CalendarAssigneeEvent & {
	id: string;
} {
	return { ownerId: 'u-sarah', calendarId: 'cal-family', ...over };
}

/** A due task: one person (its assignee), on a calendar, unless told otherwise. */
function task(over: Partial<CalendarAssigneeTask> & { id: string }): CalendarAssigneeTask & {
	id: string;
} {
	return { assignedTo: 'u-sarah', calendarId: 'cal-family', ...over };
}

/** Counts as a plain object, so an assertion reads as a fact about the numbers. */
function tally(
	events: readonly CalendarAssigneeEvent[],
	tasks: readonly CalendarAssigneeTask[]
): Record<string, number> {
	return Object.fromEntries(assigneeCounts(events, tasks));
}

describe('who a row belongs to', () => {
	it('an event belongs to its owner', () => {
		const rehearsal = [evt({ id: 'e1', ownerId: 'u-sarah' })];
		expect(isVisibleByAssignee(rehearsal, ['u-sarah'])).toHaveLength(0);
		expect(isVisibleByAssignee(rehearsal, ['u-mia'])).toHaveLength(1);
	});

	it('a due task belongs to its assignee, not to whoever loaded it', () => {
		const rows = [task({ id: 't1', assignedTo: 'u-mia' })];
		expect(isVisibleByAssignee(rows, ['u-mia'])).toHaveLength(0);
		expect(isVisibleByAssignee(rows, ['u-sarah'])).toHaveLength(1);
	});

	it('an event with no people belongs to nobody, so a person filter drops it', () => {
		const orphan = evt({ id: 'e1', ownerId: null });
		expect(isVisibleByAssignee([orphan], ['u-mia'])).toHaveLength(0);
		expect(isVisibleByAssignee([orphan], [])).toHaveLength(1);
	});

	it('keeps an ad through a person filter, as it does through every calendar one', () => {
		const ad = evt({ id: 'ad', ownerId: 'u-sarah', calendarId: '' });
		expect(isVisibleByAssignee([ad], ['u-sarah'])).toHaveLength(1);
		expect(tally([ad], [task({ id: 't1', assignedTo: 'u-mia' })])).toEqual({ 'u-mia': 1 });
	});

	it('agrees with the calendar filter on what a row with no calendar field is', () => {
		// SAFETY: a serialized row that predates the calendar field; this is the
		// shape-under-test, and both filters must read it the same way.
		const legacy = { id: 'e1', ownerId: 'u-sarah' } as CalendarAssigneeEvent;
		expect(isVisibleByAssignee([legacy], ['u-sarah'])).toHaveLength(1);
		expect(tally([legacy], [])).toEqual({});
	});

	it('returns a new array and never mutates the input', () => {
		const rows = [evt({ id: 'e1' }), task({ id: 't1' })];
		const out = isVisibleByAssignee(rows, []);
		expect(out).not.toBe(rows);
		expect(rows).toHaveLength(2);
	});
});

describe('the roster', () => {
	const sarahTask = task({ id: 't1', assignedTo: 'u-sarah', assigneeFirstName: 'Sarah' });
	const miaEvent = evt({ id: 'e1', ownerId: 'u-mia', creatorName: 'Mia' });

	it('lists every person who has something, viewer first, then by name', () => {
		const tasks = [
			sarahTask,
			task({ id: 't2', assignedTo: 'u-eli', assigneeFirstName: 'Eli' }),
			task({ id: 't3', assignedTo: 'u-mia', assigneeFirstName: 'Mia' })
		];
		expect(assigneeRoster([], tasks, 'u-eli').map((person) => person.id)).toEqual([
			'u-eli',
			'u-mia',
			'u-sarah'
		]);
	});

	it('names a person from a task first, then from the event they created', () => {
		const roster = assigneeRoster(
			[evt({ id: 'e1', ownerId: 'u-sarah', creatorName: 'S. Rivera' })],
			[sarahTask],
			'u-mia'
		);
		expect(roster).toEqual([{ id: 'u-sarah', name: 'Sarah', isViewer: false }]);
	});

	it('falls back to the creator name when no task names them', () => {
		expect(assigneeRoster([miaEvent], [], 'u-sarah')).toEqual([
			{ id: 'u-mia', name: 'Mia', isViewer: false }
		]);
	});

	it('calls the viewer "You" and everyone else by first name', () => {
		const roster = assigneeRoster([miaEvent], [sarahTask], 'u-mia');
		expect(roster).toEqual([
			{ id: 'u-mia', name: 'You', isViewer: true },
			{ id: 'u-sarah', name: 'Sarah', isViewer: false }
		]);
	});

	it('keeps a member the app has no first name for, and says so rather than guessing', () => {
		const roster = assigneeRoster([evt({ id: 'e1', ownerId: 'u-mia' })], [], 'u-sarah');
		expect(roster).toEqual([{ id: 'u-mia', name: 'A member', isViewer: false }]);
	});

	it('lists a family member with nothing in this window, and says 0', () => {
		const roster = assigneeRoster([], [], 'u-sarah', [
			{ userId: 'u-sarah', firstName: 'Sarah' },
			{ userId: 'u-mia', firstName: 'Mia' },
			{ userId: 'u-eli', firstName: 'Eli' }
		]);
		expect(roster).toEqual([
			{ id: 'u-sarah', name: 'You', isViewer: true },
			{ id: 'u-eli', name: 'Eli', isViewer: false },
			{ id: 'u-mia', name: 'Mia', isViewer: false }
		]);
		expect(assigneeCounts([], []).get('u-mia') ?? 0).toBe(0);
	});

	it('names a roster member by their real name, not "A member"', () => {
		const roster = assigneeRoster([evt({ id: 'e1', ownerId: 'u-mia' })], [], 'u-sarah', [
			{ userId: 'u-mia', firstName: 'Mia' }
		]);
		expect(roster).toEqual([{ id: 'u-mia', name: 'Mia', isViewer: false }]);
	});

	it('adds a person who has plans but is no longer on the roster', () => {
		const roster = assigneeRoster(
			[],
			[task({ id: 't1', assignedTo: 'u-gone', assigneeFirstName: 'Gone' })],
			'u-sarah',
			[{ userId: 'u-sarah', firstName: 'Sarah' }]
		);
		expect(roster.map((person) => person.id)).toEqual(['u-sarah', 'u-gone']);
		expect(roster[1].name).toBe('Gone');
	});

	it('skips a roster row with no usable id rather than rendering a ghost', () => {
		const roster = assigneeRoster([], [], 'u-sarah', [
			{ userId: '', firstName: 'Nobody' },
			{ userId: 'u-mia', firstName: '   ' }
		]);
		expect(roster).toEqual([{ id: 'u-mia', name: 'A member', isViewer: false }]);
	});

	it('accepts no roster at all and behaves exactly as before', () => {
		expect(assigneeRoster([miaEvent], [sarahTask], 'u-mia')).toEqual(
			assigneeRoster([miaEvent], [sarahTask], 'u-mia', [])
		);
	});

	it('counts nobody when there is nobody to filter by', () => {
		expect(assigneeRoster([evt({ id: 'ad', calendarId: '' })], [], 'u-sarah')).toEqual([]);
	});

	it('carries the count each person would keep', () => {
		const counts = tally(
			[evt({ id: 'e1', ownerId: 'u-sarah' }), evt({ id: 'e2', ownerId: 'u-mia' })],
			[task({ id: 't1', assignedTo: 'u-mia' })]
		);
		expect(counts).toEqual({ 'u-sarah': 1, 'u-mia': 2 });
	});
});

describe('hidden state (a reading filter, per user per device)', () => {
	it('keys storage per user, beside the calendar filter and not on top of it', () => {
		expect(hiddenAssigneesKey('u1')).toBe('familyplanz:hiddenAssignees:u1');
		expect(hiddenAssigneesKey(null)).toBe('familyplanz:hiddenAssignees:anon');
		expect(hiddenAssigneesKey('u1')).not.toBe(hiddenAssigneesKey('u2'));
		expect(hiddenAssigneesKey('u1')).not.toBe('familyplanz:hiddenCalendars:u1');
		expect(HIDDEN_ASSIGNEES_VERSION).toBe(1);
	});

	it('round-trips through the value codec', () => {
		expect(parseHiddenAssignees(serialiseHiddenAssignees(['u-mia', 'u-eli']))).toEqual([
			'u-mia',
			'u-eli'
		]);
	});

	it('junk storage means nobody hidden', () => {
		expect(parseHiddenAssignees('{oops')).toEqual([]);
		expect(parseHiddenAssignees('"nope"')).toEqual([]);
		expect(parseHiddenAssignees(null)).toEqual([]);
		expect(parseHiddenAssignees(['', 3, null, 'u-mia', 'u-mia'])).toEqual(['u-mia']);
	});

	it('toggles one person, and never an empty id', () => {
		expect(toggleAssigneeVisibility([], 'u-mia')).toEqual(['u-mia']);
		expect(toggleAssigneeVisibility(['u-mia'], 'u-mia')).toEqual([]);
		expect(toggleAssigneeVisibility(['u-mia'], '')).toEqual(['u-mia']);
	});

	it('answers whether one person is hidden', () => {
		expect(isAssigneeHidden('u-mia', ['u-mia'])).toBe(true);
		expect(isAssigneeHidden('u-sarah', ['u-mia'])).toBe(false);
		expect(isAssigneeHidden('', ['u-mia'])).toBe(false);
	});

	it('names the hidden people for the empty state, skipping ids nothing knows', () => {
		const roster = assigneeRoster(
			[],
			[task({ id: 't1', assignedTo: 'u-mia', assigneeFirstName: 'Mia' })],
			'u-sarah'
		);
		expect(hiddenAssigneeNames(roster, ['u-mia', 'u-gone'])).toEqual(['Mia']);
	});

	it('serialises a list, de-duplicated', () => {
		expect(serialiseHiddenAssignees(['u-mia', 'u-mia', 'u-eli'])).toEqual(['u-mia', 'u-eli']);
	});
});
