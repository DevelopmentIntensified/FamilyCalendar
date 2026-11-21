/**
 * The one ordered recurrence table, the shared cadence fallback, weekly day
 * lists, recurrence ends and reminders. Traced from `:1044-1239`.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { parseEventQuickAdd } from './parsing.event.rules';
import { createClaimBook } from './parsing.claims.rules';
import { readEventRecurrence, type EventRecurrenceState } from './parsing.event-recurrence.rules';
import { DateTime } from 'luxon';

/** Wed 15 Jul 2026, 14:30 UTC. */
const NOW = new Date(Date.UTC(2026, 6, 15, 14, 30));

function parsed(input: string): ReturnType<typeof parseEventQuickAdd>['parsed'] {
	return parseEventQuickAdd(input, { now: NOW, zone: 'UTC' }).parsed;
}

describe('recurrence table — first match only', () => {
	const rows: Array<[string, string]> = [
		['rent monthly on the 15th', 'monthly'],
		['class weekly on Mondays', 'weekly'],
		['gym every other week', 'biweekly'],
		['gym every 2 weeks', 'biweekly'],
		['gym every 3 days', 'every_3_days'],
		['run every Monday', 'weekly'],
		['chores repeat every week', 'weekly'],
		['chores repeats weekly', 'weekly'],
		['chores repeat annually', 'yearly'],
		['gym every week', 'weekly'],
		['gym daily', 'daily'],
		['gym every day', 'daily'],
		['gym weekly', 'weekly'],
		['gym monthly', 'monthly'],
		['gym yearly', 'yearly'],
		['gym annually', 'yearly']
	];

	it.each(rows)('%s → %s', (phrase, expected) => {
		expect(parsed(phrase).recurring).toBe(expected);
	});

	it('the shared cadence table runs last and resolves the phrases above do not', () => {
		expect(parsed('hoa dues quarterly').recurring).toBe('every_3_months');
		expect(parsed('bonus twice a year').recurring).toBe('every_6_months');
		expect(parsed('gym every 2 wks').recurring).toBe('biweekly');
	});

	it('"bi-annually" is twice a year, never yearly', () => {
		expect(parsed('bonus bi-annually').recurring).toBe('every_6_months');
	});
});

describe('weekly day lists — one token scan over the claim-masked date', () => {
	it('a trigger makes the nth-day list weekly, Monday-first', () => {
		const result = parsed('gym every Mon, Wed, Fri');
		expect(result.recurring).toBe('weekly');
		expect(result.recurringByDay).toEqual(['MO', 'WE', 'FR']);
		expect(result.date).toBe('2026-07-17');
	});

	it('a plural token makes the list weekly without a trigger', () => {
		const result = parsed('on wednesdays');
		expect(result.recurring).toBe('weekly');
		expect(result.recurringByDay).toEqual(['WE']);
		expect(result.date).toBe('2026-07-22');
	});

	it('a singular abbreviation ending in "s" stays a one-off (Q-008 B)', () => {
		const tues = parsed('lunch tues');
		expect(tues.recurring).toBeUndefined();
		expect(tues.recurringByDay).toBeUndefined();
		expect(tues.date).toBe('2026-07-21');
		const thurs = parsed('lunch thurs');
		expect(thurs.recurring).toBeUndefined();
		expect(thurs.recurringByDay).toBeUndefined();
		expect(thurs.date).toBe('2026-07-16');
	});

	// Q-008 B: only full weekday names plus "s" are plural; the canonical
	// plurals still make a series.
	const pluralRows: Array<[string, string, string]> = [
		['on tuesdays', '2026-07-21', 'TU'],
		['on thursdays', '2026-07-16', 'TH'],
		['on mondays', '2026-07-20', 'MO']
	];

	it.each(pluralRows)('%s is a weekly series (anchored %s, %s)', (phrase, date, day) => {
		const result = parsed(phrase);
		expect(result.recurring).toBe('weekly');
		expect(result.recurringByDay).toEqual([day]);
		expect(result.date).toBe(date);
	});

	it('a bare conjunction pair becomes concrete dates, not weekly', () => {
		const result = parsed('gym monday and tuesday');
		expect(result.recurring).toBeUndefined();
		expect(result.dates).toEqual(['2026-07-20', '2026-07-21']);
	});

	it('leaves lone weekdays alone ("lunch Monday" stays a single event)', () => {
		const result = parsed('lunch Monday');
		expect(result.recurring).toBeUndefined();
		expect(result.date).toBe('2026-07-20');
	});
});

describe('weekday shorthands', () => {
	it('"weekdays" ⇒ MO–FR, anchored on the next matching date', () => {
		const result = parsed('standup weekdays');
		expect(result.recurring).toBe('weekly');
		expect(result.recurringByDay).toEqual(['MO', 'TU', 'WE', 'TH', 'FR']);
		expect(result.date).toBe('2026-07-16');
	});

	it('"weekends" ⇒ SA+SU, anchored on the next matching date', () => {
		const result = parsed('market weekends');
		expect(result.recurring).toBe('weekly');
		expect(result.recurringByDay).toEqual(['SA', 'SU']);
		expect(result.date).toBe('2026-07-18');
	});

	it('"twice a week" is weekly with no invented by-day', () => {
		const result = parsed('gym twice a week');
		expect(result.recurring).toBe('weekly');
		expect(result.recurringByDay).toBeUndefined();
	});
});

describe('recurrence end — only with a frequency', () => {
	it('"for 6 weeks" sets the count', () => {
		const result = parsed('yoga every Monday for 6 weeks');
		expect(result.recurring).toBe('weekly');
		expect(result.recurringCount).toBe(6);
	});

	it('"10 times" sets the count beside a frequency', () => {
		expect(parsed('gym weekly 10 times').recurringCount).toBe(10);
	});

	it('ignores counts without a recurrence ("party in 2 weeks", "buy milk 2 times")', () => {
		expect(parsed('party in 2 weeks').recurringCount).toBeUndefined();
		expect(parsed('buy milk 2 times').recurringCount).toBeUndefined();
	});

	it('"until Dec 15" ends the series without stealing the event date', () => {
		const result = parsed('yoga every Monday until Dec 15');
		expect(result.recurring).toBe('weekly');
		expect(result.date).toBe('2026-07-20');
		expect(result.recurringUntil).toBe('2026-12-15');
	});

	it('an until date without a frequency is not a recurrence end', () => {
		expect(parsed('yoga Monday until Dec 15').recurringUntil).toBeUndefined();
	});
});

describe('reminders', () => {
	const rows: Array<[string, number]> = [
		['dinner friday remind me 30 min before', 30],
		['dinner friday reminder 2 hours before', 120],
		['dinner friday reminder 3 days before', 4320]
	];

	it.each(rows)('%s → %i minutes', (phrase, expected) => {
		expect(parsed(phrase).reminderMinutes).toBe(expected);
	});
});

describe('the recurrence phrase never leaks into the title', () => {
	// The phrase is stripped from the title source, so the surviving window is
	// "yoga " and the refinement never runs (nothing left to strip inside it):
	// legacy keeps the trailing space, exactly like the frozen golden's
	// "payday every other week" → 'payday ' row (parsing.http.db.test.ts:168).
	it.each([
		['yoga every Monday', 'yoga '],
		['chores repeat every week', 'chores '],
		['hoa dues quarterly', 'hoa dues '],
		['gym twice a week', 'gym ']
	])('%s → title %s', (phrase, expected) => {
		expect(parsed(phrase).title).toBe(expected);
	});
});

describe('readEventRecurrence — state and increments', () => {
	it('reports its increments in rule order and mutates the state', () => {
		const state: EventRecurrenceState = {};
		const phrases: string[] = [];
		const confidence = readEventRecurrence({
			text: 'yoga every Monday for 6 weeks',
			dateInput: 'yoga every Monday for 6 weeks',
			untilMatch: null,
			now: DateTime.fromJSDate(NOW, { zone: 'UTC' }),
			claims: createClaimBook(),
			stripSpans: [],
			state,
			phrases
		});
		expect(state.recurring).toBe('weekly');
		expect(state.recurringCount).toBe(6);
		expect(state.date).toBe('2026-07-20');
		expect(phrases).toContain('every Monday');
		expect(confidence).toEqual([0.2, 0.2, 0.15]);
	});
});
