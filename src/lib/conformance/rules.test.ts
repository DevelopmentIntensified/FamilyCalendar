import { describe, expect, it } from 'vitest';
import { PROPERTIES, RULES } from './rules';

describe('the rule table', () => {
	it('has exactly one rule per tracked property, and no orphan rules', () => {
		expect(Object.keys(RULES).sort()).toEqual([...PROPERTIES].sort());
	});
});

describe('the colour rule', () => {
	const rule = RULES['background-color'];

	it('canonicalises rgb() to hex so a palette match does not depend on spelling', () => {
		expect(rule('rgb(254, 213, 207)')).toBe('#fed5cf');
	});

	it('canonicalises the space-separated rgb()/rgba() syntax Tailwind v4 emits', () => {
		expect(rule('rgb(0 0 0 / 0.05)')).toBe('#0000000d');
	});

	it('canonicalises rgba() with an alpha below 1', () => {
		expect(rule('rgba(196, 94, 56, 0.3)')).toBe('#c45e384d');
	});

	it('canonicalises color(srgb ...) the way getComputedStyle reports color-mix', () => {
		expect(rule('color(srgb 1 1 1 / 0.5)')).toBe('#ffffff80');
	});

	it('collapses fully transparent to one token', () => {
		expect(rule('rgba(0, 0, 0, 0)')).toBe('transparent');
	});

	it('lowercases hex notation', () => {
		expect(rule('#FED5CF')).toBe('#fed5cf');
	});

	it('passes an unparseable value through collapsed rather than guessing', () => {
		expect(rule('  var(--x)  ')).toBe('var(--x)');
	});
});

describe('the length rule (radius, spacing, type sizes)', () => {
	const rule = RULES['border-radius'];

	it('collapses whitespace so formatting is not a deviation', () => {
		expect(rule('16px   16px 0px   0px')).toBe('16px 16px 0px 0px');
		expect(rule('16px 16px 0px 0px')).toBe('16px 16px 0px 0px');
	});

	it('keeps em-based values as the engine reports them', () => {
		expect(RULES['letter-spacing']('0.1em')).toBe('0.1em');
	});
});

describe('the shadow rule', () => {
	const rule = RULES['box-shadow'];

	it('normalises the colour inside the shadow, not just the offsets', () => {
		expect(rule('0px 1px 3px rgba(0, 0, 0, 0.1)')).toBe('0px 1px 3px #0000001a');
	});

	it('collapses whitespace across comma-separated shadow lists', () => {
		expect(rule('0 1px 2px 0   rgb(0 0 0 / 0.05),  0 1px 3px 0 rgb(0 0 0 / 0.1)')).toBe(
			'0 1px 2px 0 #0000000d, 0 1px 3px 0 #0000001a'
		);
	});
});

describe('the keyword rule (text-transform, font-weight)', () => {
	it('lowercases and collapses', () => {
		expect(RULES['text-transform']('  UPPERCASE ')).toBe('uppercase');
		expect(RULES['font-weight']('700')).toBe('700');
	});
});
