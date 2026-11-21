/**
 * Pure calendar-filter rules: the per-user storage key and value codec, the
 * hide/show toggles, and the one predicate every view reads. Expected values
 * come from the legacy table `src/lib/utils/calendarVisibility.test.ts` and the
 * README Invariants, never from running this code.
 *
 * Doc: ./README.md#the-reading-filters
 */
import { describe, expect, it } from 'vitest';
import {
	HIDDEN_CALENDARS_VERSION,
	hiddenCalendarNames,
	hiddenCalendarsKey,
	isCalendarHidden,
	isVisibleByCalendar,
	parseHiddenCalendars,
	serialiseHiddenCalendars,
	setAllCalendarsHidden,
	toggleCalendarVisibility
} from './calendarPage.calendars.rules';

const PERSONAL = { id: 'cal-personal', name: 'Personal Calendar' };
const FAMILY = { id: 'cal-family', name: 'Smith Family', color: '#e0ffff' };

describe('the storage key is per user and per device', () => {
	it('namespaces by user id', () => {
		expect(hiddenCalendarsKey('u1')).toBe('familyplanz:hiddenCalendars:u1');
		expect(hiddenCalendarsKey('u2')).not.toBe(hiddenCalendarsKey('u1'));
	});

	it('falls back to a shared bucket when there is no user yet', () => {
		expect(hiddenCalendarsKey(null)).toBe('familyplanz:hiddenCalendars:anon');
		expect(hiddenCalendarsKey(undefined)).toBe(hiddenCalendarsKey(''));
	});

	it('versions the stored shape for localPref', () => {
		expect(HIDDEN_CALENDARS_VERSION).toBe(1);
	});
});

describe('parseHiddenCalendars', () => {
	it('reads a well-formed list back unchanged', () => {
		expect(parseHiddenCalendars(['cal-personal', 'cal-family'])).toEqual([
			'cal-personal',
			'cal-family'
		]);
	});

	it('treats missing and junk as nothing hidden', () => {
		expect(parseHiddenCalendars(null)).toEqual([]);
		expect(parseHiddenCalendars(undefined)).toEqual([]);
		expect(parseHiddenCalendars('')).toEqual([]);
		expect(parseHiddenCalendars('not json')).toEqual([]);
		expect(parseHiddenCalendars({ 'cal-personal': true })).toEqual([]);
	});

	it('rejects a value that is not an array of ids', () => {
		expect(parseHiddenCalendars([1, 2, 3])).toEqual([]);
		expect(parseHiddenCalendars(['ok', 2, null, '', 'ok'])).toEqual(['ok']);
	});

	it('round-trips through the serialiser', () => {
		expect(parseHiddenCalendars(serialiseHiddenCalendars(['a', 'b']))).toEqual(['a', 'b']);
		expect(serialiseHiddenCalendars([])).toEqual([]);
		expect(serialiseHiddenCalendars(['a', 'a', '', 'b'])).toEqual(['a', 'b']);
	});
});

describe('toggleCalendarVisibility', () => {
	it('hides a visible calendar and shows a hidden one', () => {
		expect(toggleCalendarVisibility([], 'cal-family')).toEqual(['cal-family']);
		expect(toggleCalendarVisibility(['cal-family'], 'cal-family')).toEqual([]);
	});

	it('leaves the other calendars alone', () => {
		expect(toggleCalendarVisibility(['cal-family'], 'cal-personal')).toEqual([
			'cal-family',
			'cal-personal'
		]);
	});

	it('never toggles the empty id — that is an event on no calendar', () => {
		expect(toggleCalendarVisibility(['cal-family'], '')).toEqual(['cal-family']);
	});
});

describe('hide all / show all', () => {
	it('hides every calendar in one tap', () => {
		expect(setAllCalendarsHidden([PERSONAL, FAMILY], true)).toEqual(['cal-personal', 'cal-family']);
	});

	it('shows every calendar in one tap', () => {
		expect(setAllCalendarsHidden([PERSONAL, FAMILY], false)).toEqual([]);
	});

	it('ignores a calendar with no id', () => {
		expect(setAllCalendarsHidden([PERSONAL, { id: '' }], true)).toEqual(['cal-personal']);
	});

	it('lists the hidden ones by name, for the empty state', () => {
		expect(hiddenCalendarNames([PERSONAL, FAMILY], ['cal-family'])).toEqual(['Smith Family']);
	});

	it('skips a hidden id no loaded calendar knows', () => {
		expect(hiddenCalendarNames([PERSONAL], ['cal-gone'])).toEqual([]);
	});
});

describe('isCalendarHidden', () => {
	it('is true only for a listed id', () => {
		expect(isCalendarHidden('cal-family', ['cal-family'])).toBe(true);
		expect(isCalendarHidden('cal-personal', ['cal-family'])).toBe(false);
	});

	it('never hides the empty id — that is an event on no calendar', () => {
		expect(isCalendarHidden('', ['cal-family'])).toBe(false);
		expect(isCalendarHidden(null, ['cal-family'])).toBe(false);
	});
});

describe('isVisibleByCalendar', () => {
	const events = [
		{ id: 'e1', title: 'Standup', calendarId: 'cal-personal' },
		{ id: 'e2', title: 'Rehearsal', calendarId: 'cal-family' },
		{ id: 'e3', title: 'Ad', calendarId: '' }
	];

	it('removes only the hidden calendar’s events', () => {
		expect(isVisibleByCalendar(events, ['cal-family']).map((event) => event.id)).toEqual(['e1', 'e3']);
	});

	it('keeps everything when nothing is hidden', () => {
		expect(isVisibleByCalendar(events, [])).toHaveLength(3);
	});

	it('keeps an event that belongs to no calendar (an ad)', () => {
		expect(
			isVisibleByCalendar(events, ['cal-personal', 'cal-family']).map((event) => event.id)
		).toEqual(['e3']);
	});

	it('keeps an event with no calendarId field at all', () => {
		const legacy = [{ id: 'e9', title: 'Old row' }];
		expect(isVisibleByCalendar(legacy, ['cal-personal'])).toHaveLength(1);
	});

	it('applies to due tasks the same way', () => {
		const tasks = [
			{ id: 't1', calendarId: 'cal-personal' },
			{ id: 't2', calendarId: 'cal-family' }
		];
		expect(isVisibleByCalendar(tasks, ['cal-personal']).map((task) => task.id)).toEqual(['t2']);
	});

	it('keeps an ad through hide-all', () => {
		const ad = [{ id: 'ad', calendarId: null }];
		expect(isVisibleByCalendar(ad, ['cal-personal', 'cal-family'])).toHaveLength(1);
	});

	it('does not mutate the input', () => {
		const input = [...events];
		isVisibleByCalendar(input, ['cal-family']);
		expect(input).toHaveLength(3);
	});
});

describe('hiding is a reading filter, not the default-calendar setting', () => {
	it('leaves the default-calendar setting alone', () => {
		// A hidden calendar is a VIEW filter; the default calendar is the
		// creation target. Same storage, disjoint keys, no shared writer.
		const storage = new Map<string, string>();
		storage.set(hiddenCalendarsKey('u1'), JSON.stringify(serialiseHiddenCalendars(['cal-family'])));
		expect([...storage.keys()].join(' ')).not.toMatch(/defaultCalendar/i);
		expect(parseHiddenCalendars(JSON.parse(storage.get(hiddenCalendarsKey('u1')) ?? 'null'))).not.toContain(
			'defaultCalendarId'
		);
	});
});
