import { describe, expect, it } from 'vitest';
import { deriveTokens, findDeviations, formatDeviations, type Measurement } from './tokens';

const m = (selector: string, property: string, value: string): Measurement => ({
	selector,
	property,
	value
});

describe('deriveTokens', () => {
	it('unions the observed values per property across every reference page', () => {
		const tokens = deriveTokens([
			[m('a', 'border-radius', '16px'), m('a', 'background-color', 'rgb(255, 255, 255)')],
			[m('b', 'border-radius', '4px')]
		]);
		expect(tokens['border-radius']).toEqual(['4px', '16px']);
		expect(tokens['background-color']).toEqual(['#ffffff']);
	});

	it('normalises values so spelling differences are not two tokens', () => {
		const tokens = deriveTokens([
			[m('a', 'background-color', '#fed5cf')],
			[m('b', 'background-color', 'rgb(254, 213, 207)')]
		]);
		expect(tokens['background-color']).toEqual(['#fed5cf']);
	});

	it('ignores properties it has no rule for', () => {
		const tokens = deriveTokens([[m('a', 'rotate', '3deg')]]);
		expect(tokens['rotate']).toBeUndefined();
	});
});

describe('findDeviations', () => {
	const tokens = deriveTokens([
		[
			m('body > div', 'border-radius', '16px'),
			m('body > footer', 'border-radius', '4px'),
			m('body > p', 'color', 'rgb(100, 116, 139)')
		]
	]);

	it('reports nothing for a value the reference emits', () => {
		expect(findDeviations([m('x', 'border-radius', '16px')], tokens)).toEqual([]);
	});

	it('reports the selector, the property, the expected values and the actual value', () => {
		const devs = findDeviations([m('nav > a.rounded-lg', 'border-radius', '8px')], tokens);
		expect(devs).toHaveLength(1);
		expect(devs[0]).toEqual({
			selector: 'nav > a.rounded-lg',
			property: 'border-radius',
			expected: ['4px', '16px'],
			actual: '8px'
		});
	});

	it('normalises the actual value before comparing, so colour spelling is not a finding', () => {
		expect(findDeviations([m('x', 'color', '#64748b')], tokens)).toEqual([]);
	});

	it('stays silent on a property the reference never emits — no opinion is not a pass or a fail', () => {
		const ref = deriveTokens([[m('a', 'border-radius', '16px')]]);
		expect(findDeviations([m('x', 'letter-spacing', '0.1em')], ref)).toEqual([]);
	});

	it('stays silent on a property it has no rule for', () => {
		expect(findDeviations([m('x', 'rotate', '3deg')], tokens)).toEqual([]);
	});
});

describe('#129: the known-bad settings rail, as a finding', () => {
	// The marketing reference emits the approved blush (bg-[#FED5CF] on the
	// marketing pages); the app's avatar emits Tailwind orange-100. Both values
	// are what getComputedStyle reports in Chromium.
	const marketing = deriveTokens([
		[
			m('div.hero', 'background-color', 'rgb(254, 213, 207)'),
			m('span.chip', 'letter-spacing', '-0.4px'),
			m('p.byline', 'letter-spacing', '0.35px')
		]
	]);

	it('surfaces the avatar colour with the property, the expected palette and the actual', () => {
		const devs = findDeviations(
			[m('span#account-initial.grid', 'background-color', 'rgb(255, 237, 213)')],
			marketing
		);
		expect(devs).toHaveLength(1);
		expect(devs[0].property).toBe('background-color');
		expect(devs[0].actual).toBe('#ffedd5');
		expect(devs[0].expected).toContain('#fed5cf');
		expect(devs[0].selector).toContain('account-initial');
	});

	it('surfaces the section-title tracking the prototype measured at .08em against .1em', () => {
		const devs = findDeviations([m('div.px-3.pb-2', 'letter-spacing', '0.1em')], marketing);
		expect(devs).toHaveLength(1);
		expect(devs[0].property).toBe('letter-spacing');
		expect(devs[0].actual).toBe('0.1em');
		expect(devs[0].expected).toEqual(['-0.4px', '0.35px']);
	});
});

describe('formatDeviations', () => {
	it('renders one line per finding naming property, expected and actual', () => {
		const devs = findDeviations(
			[m('nav > a', 'border-radius', '8px')],
			deriveTokens([[m('a', 'border-radius', '16px')]])
		);
		expect(formatDeviations(devs)).toBe('- nav > a | border-radius | expected 16px | actual 8px');
	});

	it('truncates a long expected list rather than printing a wall of hex', () => {
		const many = deriveTokens([
			Array.from({ length: 12 }, (_, i) => m('e' + i, 'background-color', `rgb(${i}, 0, 0)`))
		]);
		const devs = findDeviations([m('x', 'background-color', 'rgb(99, 0, 0)')], many);
		const line = formatDeviations(devs);
		expect(line).toContain('+4 more');
		expect(line).toContain('actual #630000');
	});
});
