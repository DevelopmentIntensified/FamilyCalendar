/**
 * Pins the one wordmark glyph. Kernel ui; see [../README.md](../README.md).
 */
import { render, screen, cleanup } from '@testing-library/svelte';
import { describe, it, expect, afterEach } from 'vitest';
import BrandMark from './BrandMark.svelte';

afterEach(cleanup);

/* Issue 095: the navbar, the login page and the signup page each carried their
 * OWN hand-copied calendar glyph. They were already three slightly different
 * drawings — the navbar's had no linecap and no round joins, the other two did.
 * This test pins the geometry so a fourth copy cannot appear, and so the one
 * copy cannot quietly change shape. */
const GEOMETRY = [
	'<rect x="3" y="4" width="18" height="18" rx="2"',
	'<path d="M8 2v4"',
	'<path d="M16 2v4"',
	'<path d="M3 10h18"'
];

describe('BrandMark', () => {
	it('draws the canonical calendar glyph, from one set of paths', () => {
		const { container } = render(BrandMark);
		const svg = container.querySelector('svg');
		expect(svg).not.toBeNull();
		for (const shape of GEOMETRY) expect(container.innerHTML).toContain(shape);
	});

	it('is drawn on a 24x24 grid with a 2px stroke in the current text colour', () => {
		const { container } = render(BrandMark);
		const svg = container.querySelector('svg');
		if (!(svg instanceof SVGElement)) throw new Error('missing svg');
		expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
		expect(svg.getAttribute('fill')).toBe('none');
		expect(svg.getAttribute('stroke')).toBe('currentColor');
		expect(svg.getAttribute('stroke-width')).toBe('2');
		expect(svg.getAttribute('stroke-linecap')).toBe('round');
		expect(svg.getAttribute('stroke-linejoin')).toBe('round');
	});

	it('is 24 by default and takes a size prop', () => {
		const { container } = render(BrandMark);
		const def = container.querySelector('svg');
		if (!(def instanceof SVGElement)) throw new Error('missing svg');
		expect(def.getAttribute('width')).toBe('24');
		expect(def.getAttribute('height')).toBe('24');
		cleanup();
		// the login and signup call sites are h-5; the navbar is h-8
		const small = render(BrandMark, { props: { size: 20 } }).container.querySelector('svg');
		if (!(small instanceof SVGElement)) throw new Error('missing svg');
		expect(small.getAttribute('width')).toBe('20');
		expect(small.getAttribute('height')).toBe('20');
	});

	it('passes class through so it still takes text-primary-600', () => {
		const { container } = render(BrandMark, { props: { class: 'h-8 w-8 text-primary-600' } });
		expect(container.querySelector('svg')).toHaveClass('h-8', 'w-8', 'text-primary-600');
	});

	it('is hidden from assistive tech by default, because the wordmark says the name', () => {
		const { container } = render(BrandMark);
		expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
		expect(screen.queryByRole('img')).not.toBeInTheDocument();
	});

	it('becomes a labelled image when given a label', () => {
		render(BrandMark, { props: { label: 'Family Planz calendar' } });
		expect(screen.getByRole('img', { name: 'Family Planz calendar' })).toBeInTheDocument();
	});
});
