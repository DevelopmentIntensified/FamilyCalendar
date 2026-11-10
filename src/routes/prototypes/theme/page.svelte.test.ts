import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import { readable } from 'svelte/store';

const app = vi.hoisted(() => ({
	url: new URL('http://localhost/prototypes/theme?v=A'),
	goto: vi.fn(async () => {})
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- SvelteKit's $app/* are framework-injected virtual modules; no DI seam exists.
vi.mock('$app/state', () => ({
	page: {
		get url() {
			return app.url;
		}
	}
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- SvelteKit's $app/* are framework-injected virtual modules; no DI seam exists.
vi.mock('$app/stores', () => ({
	page: readable({ url: new URL('http://localhost/prototypes/theme') })
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- SvelteKit's $app/* are framework-injected virtual modules; no DI seam exists.
vi.mock('$app/navigation', () => ({
	goto: app.goto,
	afterNavigate: () => {},
	invalidateAll: vi.fn(async () => {})
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- SvelteKit's $app/* are framework-injected virtual modules; no DI seam exists.
vi.mock('$app/environment', () => ({ building: false }));

import ThemePrototype from './+page.svelte';

const VARIANTS = [
	['A', 'Baseline'],
	['B', 'De-duped nav'],
	['C', 'Lavender accents'],
	['D', 'Blush canvas']
] as const;

function atVariant(v: string) {
	app.url = new URL(`http://localhost/prototypes/theme?v=${v}`);
}

beforeEach(() => {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => ({ ok: false, json: async () => ({}) }))
	);
});

afterEach(() => {
	cleanup();
	app.goto.mockClear();
	vi.unstubAllGlobals();
});

describe('the theme prototype switcher', () => {
	it.each(VARIANTS)('renders variant %s from ?v=%s', (v, name) => {
		atVariant(v);
		render(ThemePrototype);

		expect(screen.getByTestId('theme-proto')).toHaveAttribute('data-variant', v);
		expect(screen.getByTestId('variant-label')).toHaveTextContent(`${v} (${name})`);
		expect(screen.getByTestId('proto-bar')).toBeInTheDocument();
	});

	it('falls back to A for an unknown or missing ?v', () => {
		atVariant('nonsense');
		render(ThemePrototype);
		expect(screen.getByTestId('theme-proto')).toHaveAttribute('data-variant', 'A');
	});

	it('accepts a lowercase variant key', () => {
		atVariant('c');
		render(ThemePrototype);
		expect(screen.getByTestId('theme-proto')).toHaveAttribute('data-variant', 'C');
	});

	it('states the current variant delta and its decision note', () => {
		atVariant('C');
		render(ThemePrototype);

		expect(screen.getByTestId('variant-note')).toHaveTextContent('--mp-lavender');
		expect(screen.getByTestId('decision-note')).toHaveTextContent(
			'the lavender pair joins the app'
		);
	});

	it('lists all four variants in the floating bar', () => {
		atVariant('A');
		render(ThemePrototype);

		for (const [key] of VARIANTS) {
			expect(screen.getByRole('button', { name: `Show variant ${key}` })).toBeInTheDocument();
		}
	});

	it('advances to the next variant through the URL, not local state', async () => {
		atVariant('A');
		render(ThemePrototype);

		await fireEvent.click(screen.getByRole('button', { name: 'Next variant' }));

		expect(app.goto).toHaveBeenCalledWith(
			'/prototypes/theme?v=B',
			expect.objectContaining({ replaceState: true, noScroll: true, keepFocus: true })
		);
	});

	it('wraps backwards from A to D', async () => {
		atVariant('A');
		render(ThemePrototype);

		await fireEvent.click(screen.getByRole('button', { name: 'Previous variant' }));

		expect(app.goto).toHaveBeenCalledWith(
			'/prototypes/theme?v=D',
			expect.objectContaining({ replaceState: true })
		);
	});

	it('cycles with the arrow keys', async () => {
		atVariant('C');
		render(ThemePrototype);

		await fireEvent.keyDown(window, { key: 'ArrowLeft' });

		expect(app.goto).toHaveBeenCalledWith(
			'/prototypes/theme?v=B',
			expect.objectContaining({ replaceState: true })
		);
	});

	it('leaves arrow keys alone while typing', async () => {
		atVariant('A');
		render(ThemePrototype);
		const input = document.createElement('input');
		document.body.appendChild(input);
		input.focus();

		await fireEvent.keyDown(input, { key: 'ArrowRight' });

		expect(app.goto).not.toHaveBeenCalled();
		input.remove();
	});
});

describe('the shell each variant mounts', () => {
	it('mounts the real navbar, tab bar, calendar and priorities card', () => {
		atVariant('A');
		render(ThemePrototype);

		expect(screen.getByRole('navigation', { name: 'Primary navigation' })).toBeInTheDocument();
		expect(screen.getByText('Family calendar')).toBeInTheDocument();
		expect(screen.getByText('Top-3 Priorities')).toBeInTheDocument();
		expect(screen.getAllByRole('link', { name: 'Calendar' }).length).toBeGreaterThan(0);
	});

	it('promotes the bell into the navbar in B and leaves it in the menu in A', () => {
		atVariant('A');
		render(ThemePrototype);
		expect(screen.queryByTestId('promoted-bell')).not.toBeInTheDocument();
		cleanup();

		atVariant('B');
		render(ThemePrototype);
		expect(screen.getByTestId('promoted-bell')).toBeInTheDocument();
	});
});
