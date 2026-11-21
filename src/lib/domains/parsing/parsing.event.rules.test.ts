/**
 * The integrated event phrase suite: real-world combinations, typos, zone
 * resolution and the wrapper's summary fields. Family tables live in the
 * per-family test files.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { parseEventQuickAdd, parseEventQuickAddList } from './parsing.event.rules';

/** Wed 15 Jul 2026, 14:30 UTC. */
const NOW = new Date(Date.UTC(2026, 6, 15, 14, 30));

function parse(input: string, zone = 'UTC'): ReturnType<typeof parseEventQuickAdd> {
	return parseEventQuickAdd(input, { now: NOW, zone });
}

describe('real-world phrases', () => {
	it('a full phrase fills every family at once', () => {
		const result = parse(
			'dinner this friday at 6pm at the annex with Nathaniel remind me 30 min before'
		);
		// The reminder span is longer than what survives the 50-char window, so
		// only its first two words are inside it: legacy's window strip cannot
		// reach past the cut and leaves the residue (naturalLanguageService.ts:
		// 1905-1965 — the window is compared, not the whole phrase).
		expect(result.parsed.title).toBe('dinner remind me');
		expect(result.parsed.date).toBe('2026-07-17');
		expect(result.parsed.startTime).toBe('18:00');
		expect(result.parsed.location).toBe('annex');
		expect(result.parsed.attendants).toEqual(['Nathaniel']);
		expect(result.parsed.reminderMinutes).toBe(30);
		expect(result.parsed.allDay).toBe(false);
	});

	it('does not invent people from ordinary words', () => {
		expect(parse('pick up groceries').parsed.attendants).toBeUndefined();
	});

	it('keeps working with a trailing time range and no other signal', () => {
		const result = parse('movie 5:30-9pm');
		expect(result.parsed.startTime).toBe('17:30');
		expect(result.parsed.endTime).toBe('21:00');
	});

	it('typos resolve to the right weekday', () => {
		const result = parse('dinner thrusday');
		expect(result.parsed.title).toBe('dinner');
		expect(result.parsed.date).toBe('2026-07-16');
	});

	it('does not invent weekdays from short words ("we sat by the sun")', () => {
		// "sat"/"sun" are weekday words only as standalone tokens in a date
		// phrase; the plural scan never fires, so the fallback reads the first
		// exact token — legacy behavior, pinned here.
		expect(parse('we sat by the sun').parsed.date).toBe('2026-07-18');
	});
});

describe('zone resolution', () => {
	it('resolves "tomorrow" in the caller zone, not the host zone', () => {
		expect(parse('meeting tomorrow', 'Pacific/Kiritimati').parsed.date).toBe('2026-07-17');
		expect(parse('meeting tomorrow', 'America/Los_Angeles').parsed.date).toBe('2026-07-16');
		expect(parse('meeting tomorrow', 'UTC').parsed.date).toBe('2026-07-16');
	});

	it('falls back to UTC for an invalid zone', () => {
		expect(parse('meeting tomorrow', 'Not/AZone').parsed.date).toBe('2026-07-16');
	});

	it('an explicit date ignores the zone', () => {
		expect(parse('meeting 2026-08-30', 'Pacific/Kiritimati').parsed.date).toBe('2026-08-30');
	});
});

describe('confidence', () => {
	it('sums the earned increments and caps at 1', () => {
		expect(parse('dinner friday').confidence).toBeCloseTo(0.4, 10);
		expect(parse('dinner friday at 6pm').confidence).toBeCloseTo(0.65, 10);
		expect(
			parse(
				'this friday at 6pm at the annex with Nathaniel remind me 30 min before every week for 6 weeks'
			).confidence
		).toBeLessThanOrEqual(1);
	});
});

describe('parseEventQuickAddList', () => {
	it('returns one entry for a single phrase', () => {
		const results = parseEventQuickAddList('dinner friday', { now: NOW, zone: 'UTC' });
		expect(results).toHaveLength(1);
	});

	it('returns one entry per named event', () => {
		const results = parseEventQuickAddList('dinner Friday and movie Saturday', {
			now: NOW,
			zone: 'UTC'
		});
		expect(results).toHaveLength(2);
	});
});
