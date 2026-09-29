import { describe, it, expect } from 'vitest';
import {
	CHIP_GAP_PX,
	CHIP_GLYPH_PX,
	MONTH_CELL_CHIP_PX,
	chipA11y,
	chipKindOf,
	chipSurfaceStyle,
	chipTreatment,
	chipWord,
	KINDS,
	type ChipKind
} from './chipVocabulary';

const ev = (allDay: boolean, isAd = false) => ({ allDay, isAd, color: '#0ea5e9' });

describe('chipKindOf', () => {
	it('picks one of the four treatments for every event', () => {
		expect(chipKindOf(ev(false))).toBe('timed');
		expect(chipKindOf(ev(true))).toBe('allDay');
		expect(chipKindOf(ev(false, true))).toBe('sponsored');
	});

	it('treats an all-day ad as sponsored — the ad is the stronger claim', () => {
		expect(chipKindOf(ev(true, true))).toBe('sponsored');
	});

	it('reads a nullish allDay (undefined/null) as timed', () => {
		expect(chipKindOf({ allDay: undefined, isAd: undefined })).toBe('timed');
		expect(chipKindOf({ allDay: null, isAd: null })).toBe('timed');
		expect(chipKindOf({ allDay: 0 as unknown as boolean, isAd: 0 as unknown as boolean })).toBe(
			'timed'
		);
	});
});

describe('the four treatments', () => {
	it('gives each kind its own signature, so no two are confusable cold', () => {
		const signature = (k: ChipKind) => {
			const t = chipTreatment(k);
			return [t.glyph.name, t.containerClass, t.word, t.a11y].join('|');
		};
		expect(new Set(KINDS.map(signature)).size).toBe(KINDS.length);
	});

	it('tells all-day from timed without relying on a tint', () => {
		const timed = chipTreatment('timed');
		const allDay = chipTreatment('allDay');
		// Shape differs; the shell and the rail are shared so calendar colour
		// keeps meaning only "which calendar".
		expect(allDay.glyph.name).not.toBe(timed.glyph.name);
		expect(allDay.word).toBe('All day');
		expect(timed.word).toBe('');
		// Neither carries a background fill: the old all-day tint is gone.
		for (const kind of KINDS) {
			expect(chipTreatment(kind).containerClass).not.toMatch(/bg-\[|background-color/);
		}
	});

	it('keeps hue out of the vocabulary — nothing keys off a colour class', () => {
		for (const kind of KINDS) {
			const t = chipTreatment(kind);
			for (const cls of [t.containerClass, t.glyphClass, t.wordClass]) {
				expect(cls).not.toMatch(/amber|sky|red-|emerald|primary-/);
			}
		}
	});

	it('names a word and a screen-reader phrase for every kind but timed', () => {
		expect(chipTreatment('timed').a11y).toBe('');
		expect(chipTreatment('allDay').word).toBe('All day');
		expect(chipTreatment('task').word).toBe('Task');
		expect(chipTreatment('sponsored').word).toBe('Ad');
		expect(chipTreatment('sponsored').a11y).toBe('Sponsored');
	});
});

describe('glyph geometry (computed, not eyeballed)', () => {
	it('draws every glyph in the same box so a mixed row keeps one baseline', () => {
		for (const kind of KINDS) {
			expect(chipTreatment(kind).glyph.box).toBe(CHIP_GLYPH_PX);
		}
	});

	it('fits each glyph inside its box, and never at zero', () => {
		for (const kind of KINDS) {
			const g = chipTreatment(kind).glyph;
			expect(g.width).toBeGreaterThan(0);
			expect(g.height).toBeGreaterThan(0);
			expect(g.width).toBeLessThanOrEqual(g.box);
			expect(g.height).toBeLessThanOrEqual(g.box);
		}
	});

	it('makes the all-day bar wider than the timed dot, so the pair reads apart', () => {
		expect(chipTreatment('allDay').glyph.width).toBeGreaterThan(chipTreatment('timed').glyph.width);
	});
});

describe('per-view density', () => {
	it('drops the word in a glyph view but keeps it in a word view', () => {
		expect(chipWord('allDay', 'word')).toBe('All day');
		expect(chipWord('allDay', 'glyph')).toBe('');
	});

	it('never leaves a kind glyph-only to a screen reader', () => {
		expect(chipA11y('allDay', 'glyph')).toBe('All day');
		expect(chipA11y('sponsored', 'glyph')).toBe('Sponsored');
		expect(chipA11y('task', 'glyph')).toBe('Task');
	});

	it('drops the hidden phrase in a word view — the word is already visible', () => {
		expect(chipA11y('allDay', 'word')).toBe('');
		expect(chipA11y('allDay', 'glyph')).not.toBe('');
	});
});

describe('the month cell is a glyph view, and that is computed', () => {
	it('cannot fit a word after the glyph at 320px', () => {
		// MONTH_CELL_CHIP_PX is derived from the real padding chain in the
		// module; the bar is the room left for the title once the mark is in.
		expect(MONTH_CELL_CHIP_PX - CHIP_GLYPH_PX - CHIP_GAP_PX).toBeLessThan(20);
	});
});

describe('chipSurfaceStyle', () => {
	it('carries the calendar colour as a variable, so colour means calendar', () => {
		expect(chipSurfaceStyle(ev(false))).toContain('--chip-color:#0ea5e9');
	});

	it('falls back to the neutral rail colour when the event has none', () => {
		expect(chipSurfaceStyle({ allDay: false, isAd: false })).toContain('#94a3b8');
	});

	it('hatches a sponsored chip with a neutral hatch, never a hue', () => {
		const style = chipSurfaceStyle(ev(false, true));
		expect(style).toContain('repeating-linear-gradient');
		expect(style).toContain('#0ea5e9');
		// The hatch itself is neutral — it must not repaint the chip amber.
		expect(style).not.toMatch(/rgba\(2[0-9]{2},\s*1[0-9]{2},\s*0/);
	});

	it('gives an all-day chip no background at all', () => {
		expect(chipSurfaceStyle(ev(true))).not.toContain('background');
	});
});
