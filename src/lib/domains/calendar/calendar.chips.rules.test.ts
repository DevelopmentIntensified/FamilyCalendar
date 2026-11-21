/**
 * The chip vocabulary, carried from `src/lib/utils/chipVocabulary.test.ts:11-120`,
 * `src/lib/utils/eventChip.ts` (tooltip/attribution), the day split from
 * `src/lib/utils/eventDisplay.test.ts:4-105` and the share target from
 * `src/lib/utils/shareTarget.test.ts:5-45`.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import {
	buildSharedTargetText,
	calendarNameFor,
	CHIP_GAP_PX,
	CHIP_GLYPH_PX,
	CHIP_KINDS,
	CHIP_RAIL_PX,
	chipA11y,
	chipColor,
	chipKind,
	chipSurfaceStyle,
	chipTooltip,
	chipTreatment,
	chipWord,
	describeEventChip,
	groupEventsByDay,
	MONTH_CELL_CHIP_PX,
	splitEventsByDay,
	SPONSORED_A11Y,
	SPONSORED_LABEL
} from './calendar.chips.rules';

const ev = (allDay: boolean, isAd = false) => ({ allDay, isAd, color: '#0ea5e9' });

describe('chipKind (chipVocabulary.test.ts:15-29)', () => {
	it.each([
		['a timed event', ev(false), 'timed'],
		['an all-day event', ev(true), 'allDay'],
		['a sponsored event', ev(false, true), 'sponsored'],
		['an all-day ad — the ad is the stronger claim', ev(true, true), 'sponsored'],
		['a nullish allDay', { allDay: undefined, isAd: undefined }, 'timed'],
		['null flags', { allDay: null, isAd: null }, 'timed'],
		['falsy flags', { allDay: 0 as unknown as boolean, isAd: 0 as unknown as boolean }, 'timed']
	] satisfies [string, { allDay?: boolean | null; isAd?: boolean | null }, string][])(
		'%s',
		(_name, event, expected) => {
			expect(chipKind(event)).toBe(expected);
		}
	);
});

describe('chipTreatment (chipVocabulary.test.ts:31-79)', () => {
	it('gives each kind its own signature, so no two are confusable cold', () => {
		const signature = (kind: (typeof CHIP_KINDS)[number]) => {
			const treatment = chipTreatment(kind);
			return [treatment.glyph.name, treatment.containerClass, treatment.word, treatment.a11y].join('|');
		};
		expect(new Set(CHIP_KINDS.map(signature)).size).toBe(CHIP_KINDS.length);
	});

	it.each([
		['timed', 'dot', ''],
		['allDay', 'bar', 'All day'],
		['task', 'ring', 'Task'],
		['sponsored', 'bag', SPONSORED_LABEL]
	] as const)('%s draws a %s glyph and the word %j', (kind, glyph, word) => {
		const treatment = chipTreatment(kind);
		expect(treatment.glyph.name).toBe(glyph);
		expect(treatment.word).toBe(word);
	});

	it('keeps hue out of the vocabulary and paints no background fill', () => {
		for (const kind of CHIP_KINDS) {
			const treatment = chipTreatment(kind);
			expect(treatment.containerClass).not.toMatch(/bg-\[|background-color|amber|sky|red-|emerald|primary-/);
			expect(treatment.glyphClass).not.toMatch(/amber|sky|red-|emerald|primary-/);
			expect(treatment.wordClass).not.toMatch(/amber|sky|red-|emerald|primary-/);
		}
	});

	it('names a hidden phrase for every kind but timed', () => {
		expect(chipTreatment('timed').a11y).toBe('');
		expect(chipTreatment('allDay').a11y).toBe('All day');
		expect(chipTreatment('task').a11y).toBe('Task');
		expect(chipTreatment('sponsored').a11y).toBe(SPONSORED_A11Y);
	});

	it('draws every glyph in one box and fits it', () => {
		for (const kind of CHIP_KINDS) {
			const glyph = chipTreatment(kind).glyph;
			expect(glyph.box).toBe(CHIP_GLYPH_PX);
			expect(glyph.width).toBeGreaterThan(0);
			expect(glyph.height).toBeGreaterThan(0);
			expect(glyph.width).toBeLessThanOrEqual(glyph.box);
			expect(glyph.height).toBeLessThanOrEqual(glyph.box);
		}
		expect(chipTreatment('allDay').glyph.width).toBeGreaterThan(chipTreatment('timed').glyph.width);
	});
});

describe('chipWord / chipA11y (chipVocabulary.test.ts:81-100)', () => {
	it.each([
		['allDay', 'word', 'All day'],
		['allDay', 'glyph', ''],
		['sponsored', 'word', 'Ad'],
		['timed', 'word', ''],
		['timed', 'glyph', '']
	] as const)('chipWord(%s, %s) is %j', (kind, density, expected) => {
		expect(chipWord(kind, density)).toBe(expected);
	});

	it.each([
		['allDay', 'glyph', 'All day'],
		['sponsored', 'glyph', 'Sponsored'],
		['task', 'glyph', 'Task'],
		['allDay', 'word', ''],
		['timed', 'glyph', '']
	] as const)('chipA11y(%s, %s) is %j', (kind, density, expected) => {
		expect(chipA11y(kind, density)).toBe(expected);
	});
});

describe('chipColor / chipSurfaceStyle (chipVocabulary.test.ts:102-120)', () => {
	it('uses the event colour, with the legacy neutral when it has none', () => {
		expect(chipColor({ color: '#0ea5e9' })).toBe('#0ea5e9');
		expect(chipColor({ color: null })).toBe('#94a3b8');
		expect(chipColor({})).toBe('#94a3b8');
	});

	it('carries the calendar colour as a variable, so colour means calendar', () => {
		expect(chipSurfaceStyle(ev(false))).toContain('--chip-color:#0ea5e9');
		expect(chipSurfaceStyle({ allDay: false, isAd: false })).toContain('#94a3b8');
	});

	it('hatches a sponsored chip with a neutral hatch, never a hue', () => {
		const style = chipSurfaceStyle(ev(false, true));
		expect(style).toContain('repeating-linear-gradient');
		expect(style).toContain('#0ea5e9');
		expect(style).not.toMatch(/rgba\(2[0-9]{2},\s*1[0-9]{2},\s*0/);
	});

	it('gives an all-day chip no background at all', () => {
		expect(chipSurfaceStyle(ev(true))).not.toContain('background');
	});
});

describe('calendarNameFor / chipTooltip (eventChip.ts:16-33, #067)', () => {
	const calendars = [
		{ id: 'cal-1', name: 'Personal Calendar' },
		{ id: 'cal-2', name: 'Riveras' }
	];

	it.each([
		['fewer than two calendars stay unattributed', { calendarId: 'cal-2' }, [calendars[0]], ''],
		['a matching calendar is named', { calendarId: 'cal-2' }, calendars, 'Riveras'],
		['an unknown calendar stays unattributed', { calendarId: 'cal-9' }, calendars, '']
	] as const)('%s', (_name, event, refs, expected) => {
		expect(calendarNameFor(event, refs)).toBe(expected);
	});

	it('attributes the hover hint only when the calendar is named', () => {
		expect(chipTooltip({ title: 'Soccer', calendarId: 'cal-2' }, calendars)).toBe('Soccer · Riveras');
		expect(chipTooltip({ title: 'Soccer', calendarId: 'cal-2' }, [])).toBe('Soccer');
		expect(chipTooltip({}, calendars)).toBe('');
	});
});

describe('describeEventChip (chipVocabulary + eventChip, #111)', () => {
	it('spells the kind on a glyph view’s hover hint', () => {
		const shell = describeEventChip({
			density: 'glyph',
			event: { title: 'Soccer', calendarId: 'cal-2', allDay: true },
			calendars: [
				{ id: 'cal-1', name: 'Personal Calendar' },
				{ id: 'cal-2', name: 'Riveras' }
			]
		});
		expect(shell.kind).toBe('allDay');
		expect(shell.word).toBe('');
		expect(shell.tooltip).toBe('All day · Soccer · Riveras');
	});

	it('keeps a word view’s tooltip empty and shows the word', () => {
		const shell = describeEventChip({ density: 'word', event: { title: 'Soccer' } });
		expect(shell.kind).toBe('timed');
		expect(shell.word).toBe('');
		expect(shell.tooltip).toBe('');
	});

	it('labels a sponsored chip Ad with the hidden phrase Sponsored', () => {
		const glyph = describeEventChip({ density: 'glyph', event: { title: 'Sale', isAd: true } });
		expect(glyph.kind).toBe('sponsored');
		expect(glyph.word).toBe('');
		expect(glyph.tooltip).toBe('Sponsored · Sale');
		expect(describeEventChip({ density: 'word', event: { title: 'Sale', isAd: true } }).word).toBe('Ad');
	});

	it('describes a task chip without a style and can flag it overdue', () => {
		const task = describeEventChip({ density: 'glyph', kind: 'task' });
		expect(task.kind).toBe('task');
		expect(task.word).toBe('');
		expect(task.style).toBe('');
		expect(task.tooltip).toBe('');
		expect(describeEventChip({ density: 'word', kind: 'task' }).word).toBe('Task');
		expect(describeEventChip({ density: 'word', kind: 'task', overdue: true }).containerClass).toContain(
			'border-red-400'
		);
	});
});

describe('splitEventsByDay (eventDisplay.test.ts:4-95, #224)', () => {
	it('passes a single-day event through untouched', () => {
		const [entry] = splitEventsByDay(
			[{ id: 1, title: 'One', start: '2026-03-01T10:00:00Z', end: '2026-03-01T12:00:00Z' }],
			'UTC'
		);
		expect(entry).toMatchObject({ id: 1, title: 'One' });
		expect(entry.date.toISOString()).toBe('2026-03-01T10:00:00.000Z');
		expect(entry.end?.toISOString()).toBe('2026-03-01T12:00:00.000Z');
	});

	it('treats an event without an end as single-day', () => {
		const entries = splitEventsByDay([{ id: 2, title: 'Open', start: '2026-03-01T10:00:00Z' }], 'UTC');
		expect(entries).toHaveLength(1);
		expect(entries[0].end).toBeNull();
	});

	it.each([
		['overnight Mon 22:00 → Tue 02:00', '2026-03-02T22:00:00Z', '2026-03-03T02:00:00Z', ['2026-03-02', '2026-03-03']],
		['Fri 20:00 → Sun 02:00', '2026-03-06T20:00:00Z', '2026-03-08T02:00:00Z', ['2026-03-06', '2026-03-07', '2026-03-08']],
		['Mon 23:30 → Wed 00:30', '2026-03-02T23:30:00Z', '2026-03-04T00:30:00Z', ['2026-03-02', '2026-03-03', '2026-03-04']]
	] satisfies [string, string, string, string[]][])('splits a multi-day %s onto every calendar day', (_name, start, end, days) => {
		const entries = splitEventsByDay([{ id: 9, start, end }], 'UTC');
		expect(entries.map((entry) => entry.date.toISOString().slice(0, 10))).toEqual(days);
	});

	it('splits at local midnights across a DST change', () => {
		const entries = splitEventsByDay(
			[{ id: 5, start: '2026-03-07T05:00:00.000Z', end: '2026-03-09T04:00:00.000Z' }],
			'America/New_York'
		);
		expect(entries.map((entry) => entry.date.toISOString())).toEqual([
			'2026-03-07T05:00:00.000Z',
			'2026-03-08T05:00:00.000Z',
			'2026-03-09T04:00:00.000Z'
		]);
	});

	it('splits in the viewer zone, not the server zone', () => {
		const auckland = splitEventsByDay(
			[{ id: 7, start: '2026-09-05T12:00:00Z', end: '2026-09-06T00:30:00Z' }],
			'Pacific/Auckland'
		);
		expect(auckland).toHaveLength(1);
		expect(auckland[0].date.toISOString()).toBe('2026-09-05T12:00:00.000Z');
		expect(splitEventsByDay([{ id: 7, start: '2026-09-05T12:00:00Z', end: '2026-09-06T00:30:00Z' }], 'UTC')).toHaveLength(2);
	});
});

describe('groupEventsByDay (eventDisplay.ts groupByDateKey)', () => {
	it('buckets the day split by local day key, preserving order', () => {
		const grouped = groupEventsByDay(
			[
				{ id: 'a', start: '2026-03-01T10:00:00Z', end: '2026-03-01T11:00:00Z' },
				{ id: 'b', start: '2026-03-02T10:00:00Z', end: '2026-03-02T11:00:00Z' },
				{ id: 'trip', start: '2026-03-01T22:00:00Z', end: '2026-03-02T02:00:00Z' }
			],
			'UTC'
		);
		expect([...grouped.keys()]).toEqual(['2026-03-01', '2026-03-02']);
		expect(grouped.get('2026-03-01')?.map((entry) => entry.id)).toEqual(['a', 'trip']);
		expect(grouped.get('2026-03-02')?.map((entry) => entry.id)).toEqual(['b', 'trip']);
	});

	it('returns an empty map for an empty list', () => {
		expect(groupEventsByDay([], 'UTC').size).toBe(0);
	});
});

describe('buildSharedTargetText (shareTarget.test.ts:5-45, #027)', () => {
	it.each([
		['prefers text over title', 'A link', 'soccer practice saturday 10am', '', 'soccer practice saturday 10am'],
		['falls back to title when text is empty', 'Soccer practice Saturday 10am', '', '', 'Soccer practice Saturday 10am'],
		['appends a url param when the URL is not already in the text', 'Article', 'Read this tonight', 'https://x.co/a1b2', 'Read this tonight https://x.co/a1b2'],
		['uses the url param alone when text and title are empty', '', '', 'https://x.co/a1b2', 'https://x.co/a1b2'],
		['returns empty when every param is blank', '   ', '   ', '', ''],
		['collapses newlines into spaces', '', 'dinner friday\nat 7pm', '', 'dinner friday at 7pm']
	] satisfies [string, string, string, string, string][])('%s', (_name, title, text, url, expected) => {
		expect(buildSharedTargetText(title, text, url)).toBe(expected);
	});

	it('does not duplicate a URL already embedded in the text', () => {
		const text = 'on for saturday 10am? https://m.me/r/abc123 with the schedule';
		expect(buildSharedTargetText('Messenger chat', text, '')).toBe(text);
		expect(buildSharedTargetText('Messenger chat', text, 'https://m.me/r/abc123')).toBe(text);
		const punctuated = 'check this out: https://x.co/a1b2, pretty great';
		expect(buildSharedTargetText('', punctuated, 'https://x.co/a1b2')).toBe(punctuated);
	});
});

describe('the chip constants are computed, not eyeballed (chipVocabulary.test.ts:102-110)', () => {
	it('keeps the month cell a glyph view at 320px', () => {
		expect(CHIP_KINDS).toEqual(['timed', 'allDay', 'task', 'sponsored']);
		expect(CHIP_RAIL_PX).toBeGreaterThan(0);
		expect(MONTH_CELL_CHIP_PX - CHIP_GLYPH_PX - CHIP_GAP_PX).toBeLessThan(20);
	});
});
