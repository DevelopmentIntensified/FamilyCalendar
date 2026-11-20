/**
 * The feature icon vocabulary: closed at nine names, every one with markup. That
 * every icon the features page names is in it is read off the route in
 * marketing.pages.http.test.ts (reading files keeps it out of this pure test, R4).
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { FEATURE_ICON_NAMES, featureIcon } from './marketing.icons.rules';

describe('the icon set', () => {
	it('is the closed vocabulary the features page was designed with', () => {
		expect(FEATURE_ICON_NAMES).toEqual([
			'calendar',
			'bolt',
			'users',
			'printer',
			'phone',
			'clipboard',
			'clock',
			'smile',
			'heart'
		]);
	});

	it.each(FEATURE_ICON_NAMES)('%s has its tile colours and static SVG markup', (name) => {
		const icon = featureIcon(name);
		expect(icon.bg).not.toBe('');
		expect(icon.fg).not.toBe('');
		expect(icon.body).toMatch(/^<(path|rect|circle)\b/);
		// Rendered with {@html}: static shapes only, never script or handlers.
		expect(icon.body).not.toMatch(/<script|\son\w+=|javascript:/i);
	});

	it.each([
		{ name: 'clock', strokeWidth: '1.5', filled: undefined },
		{ name: 'smile', strokeWidth: '1.5', filled: undefined },
		{ name: 'heart', strokeWidth: undefined, filled: true },
		{ name: 'calendar', strokeWidth: undefined, filled: undefined }
	] as const)('$name: stroke $strokeWidth, filled $filled', ({ name, strokeWidth, filled }) => {
		const icon = featureIcon(name);
		expect(icon.strokeWidth).toBe(strokeWidth);
		expect(icon.filled).toBe(filled);
	});
});
