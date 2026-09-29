import { describe, it, expect } from 'vitest';
import {
	allCalendarIds,
	hiddenCalendarKey,
	hiddenCalendarNames,
	isCalendarHidden,
	loadHiddenCalendars,
	parseHiddenCalendars,
	saveHiddenCalendars,
	serializeHiddenCalendars,
	setAllCalendarsHidden,
	toggleCalendarVisibility,
	visibleByCalendar,
	type KeyValueStorage
} from './calendarVisibility';

const PERSONAL = { id: 'cal-personal', name: 'Personal Calendar' };
const FAMILY = { id: 'cal-family', name: 'Smith Family', color: '#e0ffff' };

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

describe('the storage key is per user and per device', () => {
	it('namespaces by user id', () => {
		expect(hiddenCalendarKey('u1')).toBe('familyplanz:hiddenCalendars:u1');
		expect(hiddenCalendarKey('u2')).not.toBe(hiddenCalendarKey('u1'));
	});

	it('falls back to a shared bucket when there is no user yet', () => {
		expect(hiddenCalendarKey(null)).toBe('familyplanz:hiddenCalendars:anon');
		expect(hiddenCalendarKey(undefined)).toBe(hiddenCalendarKey(''));
	});
});

describe('parseHiddenCalendars', () => {
	it('reads a well-formed list back unchanged', () => {
		expect(parseHiddenCalendars('["cal-personal","cal-family"]')).toEqual([
			'cal-personal',
			'cal-family'
		]);
	});

	it('treats missing, empty and junk as nothing hidden', () => {
		expect(parseHiddenCalendars(null)).toEqual([]);
		expect(parseHiddenCalendars(undefined)).toEqual([]);
		expect(parseHiddenCalendars('')).toEqual([]);
		expect(parseHiddenCalendars('not json')).toEqual([]);
	});

	it('rejects JSON that is not an array of ids', () => {
		expect(parseHiddenCalendars('{"cal-personal":true}')).toEqual([]);
		expect(parseHiddenCalendars('"cal-personal"')).toEqual([]);
		expect(parseHiddenCalendars('[1,2,3]')).toEqual([]);
	});

	it('drops empties and duplicates', () => {
		expect(parseHiddenCalendars('["a","a","","b"]')).toEqual(['a', 'b']);
	});

	it('round-trips through serialize', () => {
		expect(parseHiddenCalendars(serializeHiddenCalendars(['a', 'b']))).toEqual(['a', 'b']);
		expect(serializeHiddenCalendars([])).toBe('[]');
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
});

describe('hide all / show all', () => {
	it('hides every calendar in one tap', () => {
		expect(setAllCalendarsHidden([PERSONAL, FAMILY], true)).toEqual(['cal-personal', 'cal-family']);
	});

	it('shows every calendar in one tap', () => {
		expect(setAllCalendarsHidden([PERSONAL, FAMILY], false)).toEqual([]);
	});

	it('ignores a calendar with no id', () => {
		expect(allCalendarIds([PERSONAL, { id: '' }])).toEqual(['cal-personal']);
	});

	it('lists the hidden ones by name, for the empty state', () => {
		expect(hiddenCalendarNames([PERSONAL, FAMILY], ['cal-family'])).toEqual(['Smith Family']);
	});
});

describe('isCalendarHidden', () => {
	it('is true only for a listed id', () => {
		expect(isCalendarHidden('cal-family', ['cal-family'])).toBe(true);
		expect(isCalendarHidden('cal-personal', ['cal-family'])).toBe(false);
	});

	it('never hides the empty id — that is an event on no calendar', () => {
		expect(isCalendarHidden('', ['cal-family'])).toBe(false);
	});
});

describe('visibleByCalendar', () => {
	const events = [
		{ id: 'e1', title: 'Standup', calendarId: 'cal-personal' },
		{ id: 'e2', title: 'Rehearsal', calendarId: 'cal-family' },
		{ id: 'e3', title: 'Ad', calendarId: '' }
	];

	it('removes only the hidden calendar’s events', () => {
		expect(visibleByCalendar(events, ['cal-family']).map((e) => e.id)).toEqual(['e1', 'e3']);
	});

	it('keeps everything when nothing is hidden', () => {
		expect(visibleByCalendar(events, [])).toHaveLength(3);
	});

	it('keeps an event that belongs to no calendar (an ad)', () => {
		// Hiding a calendar must not be able to hide sponsored content, which
		// is deliberately on no calendar row.
		expect(visibleByCalendar(events, ['cal-personal', 'cal-family']).map((e) => e.id)).toEqual([
			'e3'
		]);
	});

	it('keeps an event with no calendarId field at all', () => {
		const legacy = [{ id: 'e9', title: 'Old row' }];
		expect(visibleByCalendar(legacy, ['cal-personal'])).toHaveLength(1);
	});

	it('applies to due tasks the same way', () => {
		const tasks = [
			{ id: 't1', calendarId: 'cal-personal' },
			{ id: 't2', calendarId: 'cal-family' }
		];
		expect(visibleByCalendar(tasks, ['cal-personal']).map((t) => t.id)).toEqual(['t2']);
	});

	it('does not mutate the input', () => {
		const input = [...events];
		visibleByCalendar(input, ['cal-family']);
		expect(input).toHaveLength(3);
	});
});

describe('persistence', () => {
	it('writes exactly one key, scoped to the user', () => {
		const storage = fakeStorage();
		saveHiddenCalendars(storage, 'u1', ['cal-family']);
		expect(Object.keys(storage.data)).toEqual(['familyplanz:hiddenCalendars:u1']);
		expect(storage.data['familyplanz:hiddenCalendars:u1']).toBe('["cal-family"]');
	});

	it('reads back after a reload', () => {
		const storage = fakeStorage({ 'familyplanz:hiddenCalendars:u1': '["cal-family"]' });
		expect(loadHiddenCalendars(storage, 'u1')).toEqual(['cal-family']);
	});

	it('keeps two users’ filters apart on the same device', () => {
		const storage = fakeStorage();
		saveHiddenCalendars(storage, 'u1', ['cal-family']);
		saveHiddenCalendars(storage, 'u2', ['cal-personal']);
		expect(loadHiddenCalendars(storage, 'u1')).toEqual(['cal-family']);
		expect(loadHiddenCalendars(storage, 'u2')).toEqual(['cal-personal']);
	});

	it('treats unavailable storage as nothing hidden rather than throwing', () => {
		expect(loadHiddenCalendars(null, 'u1')).toEqual([]);
		expect(() => saveHiddenCalendars(null, 'u1', ['cal-family'])).not.toThrow();
	});

	it('swallows a storage that throws on write (private mode)', () => {
		const hostile: KeyValueStorage = {
			getItem: () => null,
			setItem: () => {
				throw new Error('QuotaExceededError');
			}
		};
		expect(() => saveHiddenCalendars(hostile, 'u1', ['cal-family'])).not.toThrow();
	});

	it('touches nothing the default-calendar setting owns', () => {
		// A hidden calendar is a VIEW filter; the default calendar is the
		// creation target. Same storage, disjoint keys, no shared writer.
		const storage = fakeStorage();
		saveHiddenCalendars(storage, 'u1', ['cal-family']);
		expect(JSON.stringify(storage.data)).not.toMatch(/defaultCalendar/i);
		expect(loadHiddenCalendars(storage, 'u1')).not.toContain('defaultCalendarId');
	});
});
