/**
 * The title rebuild and the defaults. Traced from `:1905-2033` and the
 * "Clean titles" suite.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import {
	applyEventDefaults,
	buildEventTitle,
	cleanTitleText,
	isAllDayPhrase,
	readAtLocation,
	stripTitleSpans
} from './parsing.event-title.rules';
import { parseEventQuickAdd } from './parsing.event.rules';
import { DateTime } from 'luxon';

const NOW = new Date(Date.UTC(2026, 6, 15, 14, 30));

function parsed(input: string): ReturnType<typeof parseEventQuickAdd>['parsed'] {
	return parseEventQuickAdd(input, { now: NOW, zone: 'UTC' }).parsed;
}

describe('cleanTitleText — connectors beside a stripped span go', () => {
	it.each([
		['running  and  at  fun', 'running fun'],
		['fish and chips', 'fish and chips'],
		['on  and  dinner', 'dinner']
	])('%s → %s', (input, expected) => {
		expect(cleanTitleText(input)).toBe(expected);
	});

	it('stripTitleSpans blanks a phrase and cosmetic digit times', () => {
		expect(cleanTitleText(stripTitleSpans('dinner on monday at 6pm', ['monday']))).toBe('dinner');
	});
});

describe('the title is the unmatched text', () => {
	const rows: Array<[string, string]> = [
		['dinner on monday at 6pm', 'dinner'],
		['run at snow flex', 'run'],
		['gym every Monday', 'gym'],
		['meeting at the annex', 'meeting']
	];

	it.each(rows)('%s → %s', (phrase, expected) => {
		expect(parsed(phrase).title).toBe(expected);
	});

	it('keeps a leading meridiem as text ("PM Certification 4 Days")', () => {
		expect(parsed('PM Certification 4 Days').title).toBe('PM Certification 4 Days');
	});

	it('never ends the title mid-word at the 50-char cut', () => {
		const prefix = 'a'.repeat(45);
		const title = parsed(`${prefix} supercalifragilisticexpialidocious`).title!;
		expect(title).toBe(prefix);
	});

	it('a window that empties completely falls back to the raw 50-char window', () => {
		// Only schedule words: the stripped window is empty, so the raw window
		// (date words included) comes back rather than a blank title.
		expect(parsed('monday').title).toBe('monday');
	});
});

describe('URLs ride whole in the description and never in the title', () => {
	it('captures the URL, removes it from the title and puts it in description', () => {
		const result = parsed('standup https://meet.example.com/abc-def');
		expect(result.title).toBe('standup');
		expect(result.description).toBe('https://meet.example.com/abc-def');
	});

	it('strips trailing punctuation from a captured URL', () => {
		expect(parsed('standup https://meet.example.com/abc.').description).toBe(
			'https://meet.example.com/abc'
		);
	});

	it('a URL can never be cut by the 50-char window', () => {
		const url = 'https://meet.example.com/a-very-long-meeting-link-that-exceeds-fifty-chars';
		const result = parsed(`standup ${url}`);
		expect(result.description).toBe(url);
	});
});

describe('defaults', () => {
	it('an unmatched date becomes today in the caller zone', () => {
		expect(parsed('meet').date).toBe('2026-07-15');
	});

	it('"all day" sets allDay and the 09:00–17:00 window', () => {
		const result = parsed('picnic all day');
		expect(result.allDay).toBe(true);
		expect(result.startTime).toBe('09:00');
		expect(result.endTime).toBe('17:00');
	});

	it('"birthday" sets allDay but KEEPS a stated time', () => {
		const result = parsed('birthday party at 6pm');
		expect(result.allDay).toBe(true);
		expect(result.startTime).toBe('18:00');
		expect(result.endTime).toBeUndefined();
	});

	it('isAllDayPhrase names the four cues', () => {
		for (const phrase of ['all day', 'all-day', 'whole day', 'birthday']) {
			expect(isAllDayPhrase(phrase), phrase).toBe(true);
		}
		expect(isAllDayPhrase('all hands')).toBe(false);
	});

	it('"Event @ Location" reads the suffix as a location under 100 chars', () => {
		expect(parsed('party @ The Barn').location).toBe('The Barn');
	});

	it('never reads an @ suffix 100 chars or longer as a location', () => {
		const long = 'x'.repeat(100);
		expect(parsed(`party @ ${long}`).location).toBeUndefined();
	});

	it('caps confidence at 1', () => {
		const result = parseEventQuickAdd(
			'this friday at 6pm at the annex with Nathaniel remind me 30 min before every week for 6 weeks',
			{ now: NOW, zone: 'UTC' }
		);
		expect(result.confidence).toBeLessThanOrEqual(1);
	});
});

describe('Clean titles (legacy table)', () => {
	const cases: Array<[string, string]> = [
		['launch on wednesdays, sept 23 & 30 from 5:30-6:30pm', 'launch'],
		['yoga every Tuesday for 6 weeks at 6pm', 'yoga'],
		['dentist tomorrow at 3pm remind me 30 min before', 'dentist'],
		['dinner Friday on the family calendar', 'dinner'],
		['team sync weekly on Mon & Wed at 9am', 'team sync']
	];

	it.each(cases)('titles "%s" as "%s"', (phrase, expected) => {
		expect(parsed(phrase).title).toBe(expected);
	});

	it('falls back to the raw text when stripping leaves nothing ("sept 23")', () => {
		const title = parsed('sept 23').title ?? '';
		expect(title.length).toBeGreaterThan(0);
	});
});

describe('buildEventTitle and the summary fields', () => {
	it('reports the raw-title increment only when a title survives', () => {
		const reading = buildEventTitle({
			nonUrlText: 'dinner',
			lower: 'dinner',
			recurrencePhrases: [],
			stripSpans: [],
			titleOnlySpans: [],
			relativeDurationMatch: null,
			relativeMatch: null
		});
		expect(reading.title).toBe('dinner');
		expect(reading.confidence).toEqual([0.2]);
	});

	it('hasInfo is false when nothing but the title and default date was read', () => {
		const result = parseEventQuickAdd('dinner', { now: NOW, zone: 'UTC' });
		expect(result.hasInfo).toBe(false);
		expect(result.summaryLabel).toBeNull();
	});

	it('hasInfo is true and the summary names what was read', () => {
		const result = parseEventQuickAdd('dinner friday at 6pm', { now: NOW, zone: 'UTC' });
		expect(result.hasInfo).toBe(true);
		expect(result.summaryLabel).toBe('2026-07-17 · 18:00');
	});
});

describe('applyEventDefaults and readAtLocation', () => {
	it('fills the default date and the all-day window in place', () => {
		const state: {
			date?: string;
			startTime?: string;
			endTime?: string;
			allDay?: boolean;
			description?: string;
		} = { allDay: true };
		applyEventDefaults(state, [], DateTime.fromJSDate(NOW, { zone: 'UTC' }));
		expect(state.date).toBe('2026-07-15');
		expect(state.startTime).toBe('09:00');
		expect(state.endTime).toBe('17:00');
	});

	it('readAtLocation keeps the text before a weekday', () => {
		expect(readAtLocation('party @ The Barn friday', undefined).location).toBe('The Barn');
		expect(readAtLocation('no at sign', undefined).location).toBeUndefined();
	});
});
