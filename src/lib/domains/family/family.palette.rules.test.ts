/**
 * Pure palette rules. Carries the legacy `familyPalette.test.ts` cases (the
 * palette is one declaration; the retired blue is not a member; the guard is
 * exact). Expected values come from the rule and the approved prototype.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import {
	DEFAULT_FAMILY_COLOR,
	FAMILY_PALETTE,
	isFamilyColor,
	isHexColor,
	RETIRED_FAMILY_COLOR
} from './family.palette.rules';

describe('the family palette is the single declaration', () => {
	// Legacy familyPalette.test.ts:16-18.
	it('takes its default from its own first entry, not from a second literal', () => {
		expect(DEFAULT_FAMILY_COLOR).toBe(FAMILY_PALETTE[0].value);
	});

	// Legacy familyPalette.test.ts:20-28.
	it('is six earthy swatches, each named, each a lowercase 6-digit hex, all distinct', () => {
		expect(FAMILY_PALETTE).toHaveLength(6);
		for (const colour of FAMILY_PALETTE) {
			expect(colour.name).toMatch(/\S/);
			expect(colour.value).toMatch(/^#[0-9a-f]{6}$/);
		}
		expect(new Set(FAMILY_PALETTE.map((colour) => colour.value)).size).toBe(FAMILY_PALETTE.length);
	});

	// Legacy familyPalette.test.ts:30-32.
	it('opens on a terracotta, the approved prototype default', () => {
		expect(FAMILY_PALETTE[0]).toEqual({ name: 'Terracotta', value: '#c45e38' });
	});

	// Legacy familyPalette.test.ts:34-41.
	it('rejects the retired blue: the palette replaced it, it did not join it', () => {
		expect(RETIRED_FAMILY_COLOR).toBe('#3B82F6');
		expect(FAMILY_PALETTE.map((colour) => colour.value)).not.toContain(RETIRED_FAMILY_COLOR);
		expect(isFamilyColor(RETIRED_FAMILY_COLOR)).toBe(false);
	});
});

describe('isFamilyColor: the guard on the way into the column', () => {
	it.each(FAMILY_PALETTE.map((colour) => [colour.name, colour.value] as const))(
		'accepts the declared colour %s (%s)',
		(_name, value) => {
			expect(isFamilyColor(value)).toBe(true);
		}
	);

	// Legacy familyPalette.test.ts:43-65.
	it.each<[string, string | null | undefined]>([
		['an empty field', ''],
		['whitespace', '   '],
		['a colour word rather than a hex', 'red'],
		['a hex that is not in the palette', '#123456'],
		['the same hex in a different case', '#C45E38'],
		['a palette hex with trailing space', '#c45e38 '],
		['a css expression, which is what a crafted post would try', 'red; background:url(x)'],
		['the retired default blue', RETIRED_FAMILY_COLOR],
		['null', null],
		['undefined', undefined]
	])('refuses %s', (_what, value) => {
		expect(isFamilyColor(value)).toBe(false);
	});
});

describe('isHexColor: the wider PATCH rule (Q-025)', () => {
	it.each<[string, boolean]>([
		['#000001', true],
		['#C45E38', true],
		['#c45e38', true],
		['c45e38', false],
		['#c45e3', false],
		['#c45e388', false],
		['#gggggg', false],
		[' #c45e38', false],
		['', false]
	])('isHexColor(%j) → %s', (value, expected) => {
		expect(isHexColor(value)).toBe(expected);
	});

	it('is wider than the palette: a palette colour is always a hex, not the reverse', () => {
		for (const colour of FAMILY_PALETTE) expect(isHexColor(colour.value)).toBe(true);
		expect(isHexColor('#000001')).toBe(true);
		expect(isFamilyColor('#000001')).toBe(false);
	});
});
