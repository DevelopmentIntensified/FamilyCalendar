/**
 * The `/family/create` page's presentation rules: the named swatch, the
 * preview's initials and slot, the room the plan leaves, the banner and the
 * usage line. The create use-case itself is pinned by the service tests.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import {
	FAMILY_PREVIEW_SLOT_BELOW,
	familyCreateUsageLabel,
	familyLimitBannerCopy,
	familyPaletteName,
	familyPickRoomLeft,
	familyPreviewInitials
} from './family.create.rules';

describe('familyPaletteName', () => {
	it.each([
		['#c45e38', 'Terracotta'],
		['#4d9c85', 'Sage'],
		['#8d7aa8', 'Plum']
	])('names %s in plain words', (value, expected) => {
		expect(familyPaletteName(value)).toBe(expected);
	});

	it('falls back to the first swatch for a colour the palette retired', () => {
		expect(familyPaletteName('#3B82F6')).toBe('Terracotta');
	});
});

describe('familyPreviewInitials', () => {
	it('takes one letter per name', () => {
		expect(familyPreviewInitials({ firstName: 'Maya', lastName: 'Lopez' })).toBe('ML');
		expect(familyPreviewInitials({ firstName: 'Maya' })).toBe('M');
	});

	it('never draws a blank avatar', () => {
		expect(familyPreviewInitials({})).toBe('?');
		expect(familyPreviewInitials({ firstName: '', lastName: '' })).toBe('?');
	});
});

describe('familyPickRoomLeft', () => {
	it('counts the creator against the member limit', () => {
		expect(familyPickRoomLeft(5, 0)).toBe(4);
		expect(familyPickRoomLeft(5, 3)).toBe(1);
		expect(familyPickRoomLeft(5, 4)).toBe(0);
	});
});

describe('familyCreateUsageLabel', () => {
	it.each([
		[1, 3, '1 of 3 families used on your plan.'],
		[1, 1, '1 of 1 family used on your plan.'],
		[0, 1, '0 of 1 family used on your plan.']
	])('prints %i of %i in the right number', (used, limit, expected) => {
		expect(familyCreateUsageLabel(used, limit)).toBe(expected);
	});
});

describe('familyLimitBannerCopy', () => {
	it('names the limit it reached', () => {
		expect(familyLimitBannerCopy(3)).toBe(
			"You've reached your family limit (3 family). Upgrade to Family Master to create unlimited families."
		);
	});

	it('prints 1 for a missing limit, as the legacy copy did', () => {
		expect(familyLimitBannerCopy(0)).toContain('(1 family)');
	});
});

describe('the preview slot', () => {
	it('leaves room for another until two people are picked', () => {
		expect(FAMILY_PREVIEW_SLOT_BELOW).toBe(2);
	});
});
