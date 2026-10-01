import { describe, it, expect } from 'vitest';
import {
	assigneeCounts,
	assigneeKey,
	assigneeRoster,
	hiddenAssigneeNames,
	isAssigneeHidden,
	loadHiddenAssignees,
	parseHiddenAssignees,
	saveHiddenAssignees,
	serializeHiddenAssignees,
	toggleAssigneeVisibility,
	visibleByAssignee,
	type AssigneeEventLike,
	type AssigneeTaskLike,
	type KeyValueStorage
} from './calendarAssignees';

/** An event: one person (its owner), on a calendar, unless told otherwise. */
function evt(over: Partial<AssigneeEventLike> & { id: string }): AssigneeEventLike {
	return { ownerId: 'u-sarah', calendarId: 'cal-family', ...over };
}

/** A due task: one person (its assignee), on a calendar, unless told otherwise. */
function task(over: Partial<AssigneeTaskLike> & { id: string }): AssigneeTaskLike {
	return { assignedTo: 'u-sarah', calendarId: 'cal-family', ...over };
}

// A storage that records every write, so a test can prove which key was used.
function fakeStorage(seed: Record<string, string> = {}): KeyValueStorage & {
	data: Record<string, string>;
} {
	const data = { ...seed };
	return {
		data,
		getItem: (k) => data[k] ?? null,
		setItem: (k, v) => {
			data[k] = v;
		}
	};
}

/** The tally as a plain object, so an assertion reads as a fact about the
 *  numbers rather than about a container. */
function tally(
	events: readonly AssigneeEventLike[],
	tasks: readonly AssigneeTaskLike[]
): Record<string, number> {
	return Object.fromEntries(assigneeCounts(events, tasks));
}

describe('calendarAssignees — who a row belongs to', () => {
	it('an event belongs to its owner', () => {
		const rehearsal = [evt({ id: 'e1', ownerId: 'u-sarah' })];
		expect(visibleByAssignee(rehearsal, ['u-sarah'])).toHaveLength(0);
		expect(visibleByAssignee(rehearsal, ['u-mia'])).toHaveLength(1);
	});

	it('a due task belongs to its assignee, not to whoever loaded it', () => {
		const rows = [task({ id: 't1', assignedTo: 'u-mia' })];
		expect(visibleByAssignee(rows, ['u-mia'])).toHaveLength(0);
		expect(visibleByAssignee(rows, ['u-sarah'])).toHaveLength(1);
	});

	it('an event with no people belongs to nobody, so a person filter drops it', () => {
		// The honest reading of "only this person's plans": a row the app cannot
		// attribute to anyone is not that person's plan.
		const orphan = evt({ id: 'e1', ownerId: null });
		expect(visibleByAssignee([orphan], ['u-mia'])).toHaveLength(0);
		// …and nothing is filtered while nobody is switched off.
		expect(visibleByAssignee([orphan], [])).toHaveLength(1);
	});

	it('a sponsored event survives every person filter, as it does every calendar one', () => {
		// `calendarVisibility` is explicit that an event on no calendar is an ad
		// and no calendar toggle may reach it. The ad belongs to no family member
		// either, so the second reading filter must not invent one and drop it.
		const ad = evt({ id: 'ad', ownerId: 'u-sarah', calendarId: '' });
		expect(visibleByAssignee([ad], ['u-sarah'])).toHaveLength(1);
		// It is nobody's, so it is nobody's count either.
		expect(tally([ad], [task({ id: 't1', assignedTo: 'u-mia' })])).toEqual({ 'u-mia': 1 });
	});

	it('agrees with the calendar filter on what a row with no calendar field is', () => {
		// `isCalendarHidden` reads a missing calendarId as "a sponsored ad, do
		// not touch". Two filters over the same rows must not disagree about it.
		// SAFETY: a serialized row that predates the calendar field. The assertion
		// only says "this is an event-shaped object with one field missing",
		// which is the case under test.
		const legacy = { id: 'e1', ownerId: 'u-sarah' } as AssigneeEventLike;
		expect(visibleByAssignee([legacy], ['u-sarah'])).toHaveLength(1);
		// …and it is nobody's for counting too: one filter's idea of an ad is
		// the other filter's idea, or the two disagree on one row.
		expect(tally([legacy], [])).toEqual({});
	});

	it('returns a new array and never mutates the input', () => {
		const rows = [evt({ id: 'e1' }), task({ id: 't1' })];
		const out = visibleByAssignee(rows, []);
		expect(out).not.toBe(rows);
		expect(rows).toHaveLength(2);
	});
});

describe('calendarAssignees — the roster', () => {
	const sarahTask = task({ id: 't1', assignedTo: 'u-sarah', assigneeFirstName: 'Sarah' });
	const miaEvent = evt({ id: 'e1', ownerId: 'u-mia', creatorName: 'Mia' });

	it('lists every person who has something, viewer first, then by name', () => {
		const tasks = [
			sarahTask,
			task({ id: 't2', assignedTo: 'u-eli', assigneeFirstName: 'Eli' }),
			task({ id: 't3', assignedTo: 'u-mia', assigneeFirstName: 'Mia' })
		];
		expect(assigneeRoster([], tasks, 'u-eli').map((p) => p.id)).toEqual(['u-eli', 'u-mia', 'u-sarah']);
	});

	it('names a person from a task first, then from the event they created', () => {
		// The loader attaches an assignee's name to any task and a creator's
		// first name to FAMILY events only, so the task is the richer source.
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
		// A member whose only rows are personal-calendar events carries no name:
		// `attachCreatorNames` runs on FAMILY events only. The row still belongs
		// in the filter — otherwise their plans could never be switched back on
		// — and the label admits what is known.
		const roster = assigneeRoster([evt({ id: 'e1', ownerId: 'u-mia' })], [], 'u-sarah');
		expect(roster).toEqual([{ id: 'u-mia', name: 'A member', isViewer: false }]);
	});

	it('counts nobody when there is nobody to filter by', () => {
		// Ads and nothing else: an empty roster, not a fake "Unassigned" row.
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

describe('calendarAssignees — hidden state (a reading filter, per user per device)', () => {
	it('keys storage per user, beside the calendar filter and not on top of it', () => {
		expect(assigneeKey('u1')).toBe('familyplanz:hiddenAssignees:u1');
		expect(assigneeKey(null)).toBe('familyplanz:hiddenAssignees:anon');
		expect(assigneeKey('u1')).not.toBe(assigneeKey('u2'));
	});

	it('round-trips through storage', () => {
		const storage = fakeStorage();
		saveHiddenAssignees(storage, 'u1', ['u-mia', 'u-eli']);
		expect(storage.data).toEqual({ 'familyplanz:hiddenAssignees:u1': '["u-mia","u-eli"]' });
		expect(loadHiddenAssignees(storage, 'u1')).toEqual(['u-mia', 'u-eli']);
	});

	it('degrades to showing everyone on junk, an absent store, or no storage at all', () => {
		expect(parseHiddenAssignees('{oops')).toEqual([]);
		expect(parseHiddenAssignees('"nope"')).toEqual([]);
		expect(parseHiddenAssignees('["", 3, null, "u-mia", "u-mia"]')).toEqual(['u-mia']);
		expect(loadHiddenAssignees(fakeStorage(), 'u1')).toEqual([]);
		expect(loadHiddenAssignees(null, 'u1')).toEqual([]);
	});

	it('survives a storage that throws, rather than breaking the toggle', () => {
		const hostile: KeyValueStorage = {
			getItem: () => {
				throw new Error('denied');
			},
			setItem: () => {
				throw new Error('denied');
			}
		};
		expect(loadHiddenAssignees(hostile, 'u1')).toEqual([]);
		expect(() => saveHiddenAssignees(hostile, 'u1', ['u-mia'])).not.toThrow();
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
		const roster = assigneeRoster([], [task({ id: 't1', assignedTo: 'u-mia', assigneeFirstName: 'Mia' })], 'u-sarah');
		expect(hiddenAssigneeNames(roster, ['u-mia', 'u-gone'])).toEqual(['Mia']);
	});

	it('serialises a list, de-duplicated', () => {
		expect(serializeHiddenAssignees(['u-mia', 'u-mia', 'u-eli'])).toBe('["u-mia","u-eli"]');
	});
});
