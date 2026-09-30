import { describe, it, expect } from 'vitest';
import {
	FAMILY_PALETTE,
	DEFAULT_FAMILY_COLOR,
	RETIRED_FAMILY_COLOR,
	isFamilyColor
} from './familyPalette';

/**
 * The default family colour is one fact in one place (issue 099). It used to be
 * written out twice — the swatch state in the view and the create action's
 * fallback — so the two could drift apart silently, and a form post with no
 * colour field silently got the other one.
 */
describe('the family palette is the single declaration', () => {
	it('takes its default from its own first entry, not from a second literal', () => {
		expect(DEFAULT_FAMILY_COLOR).toBe(FAMILY_PALETTE[0].value);
	});

	it('is six earthy swatches, each named, each a lowercase 6-digit hex, all distinct', () => {
		expect(FAMILY_PALETTE).toHaveLength(6);

		for (const colour of FAMILY_PALETTE) {
			expect(colour.name).toMatch(/\S/);
			expect(colour.value).toMatch(/^#[0-9a-f]{6}$/);
		}
		expect(new Set(FAMILY_PALETTE.map((c) => c.value)).size).toBe(FAMILY_PALETTE.length);
	});

	it('opens on a terracotta, the approved prototype default', () => {
		expect(FAMILY_PALETTE[0]).toEqual({ name: 'Terracotta', value: '#c45e38' });
	});

	it('no longer carries the old blue default — the palette replaced it, it did not join it', () => {
		// Pinned deliberately: if someone re-adds the retired blue, this fails and
		// the decision has to be made again on purpose rather than by accident.
		expect(RETIRED_FAMILY_COLOR).toBe('#3B82F6');
		expect(FAMILY_PALETTE.map((c) => c.value)).not.toContain(RETIRED_FAMILY_COLOR);
		expect(isFamilyColor(RETIRED_FAMILY_COLOR)).toBe(false);
	});
});

describe('isFamilyColor — the guard on the way into the column', () => {
	it('accepts every declared colour', () => {
		for (const colour of FAMILY_PALETTE) {
			expect(isFamilyColor(colour.value)).toBe(true);
		}
	});

	const refused: [string, string][] = [
		['an empty field', ''],
		['whitespace', '   '],
		['a colour word rather than a hex', 'red'],
		['a hex that is not in the palette', '#123456'],
		['the same hex in a different case', '#C45E38'],
		['a palette hex with trailing space', '#c45e38 '],
		['a css expression, which is what a crafted post would try', 'red; background:url(x)'],
		['the retired default blue', RETIRED_FAMILY_COLOR]
	];

	for (const [what, value] of refused) {
		it(`refuses ${what}`, () => {
			expect(isFamilyColor(value)).toBe(false);
		});
	}
});
