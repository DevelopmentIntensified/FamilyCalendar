/**
 * The feature icon vocabulary: closed at nine names, every one with markup, and
 * every icon the pages name is in it (read off the route, not a list kept here).
 *
 * Doc: ./README.md#invariants
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

describe('the pages', () => {
	it('every icon name in the pages is in the set', () => {
		const source = readFileSync(
			join(process.cwd(), 'src', 'routes', '(marketing)', 'features', '+page.svelte'),
			'utf8'
		);
		const used = [...source.matchAll(/\bicon:\s*'([a-z]+)'/g)].map((match) => match[1]);
		// The scan must find the page's icons at all, or the loop below proves nothing.
		expect(used.length).toBeGreaterThan(0);
		for (const name of used) {
			const known = FEATURE_ICON_NAMES.some((candidate) => candidate === name);
			expect(known, `${name} is not an icon`).toBe(true);
		}
	});
});
