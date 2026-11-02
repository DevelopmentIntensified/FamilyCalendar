import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readable } from 'svelte/store';
import Navbar from './Navbar.svelte';
import { measureBox } from '$lib/utils/touchTarget';

// oxlint-disable-next-line anti-slop/no-module-mocking -- SvelteKit $app/stores is a framework virtual module; no DI seam exists.
vi.mock('$app/stores', () => ({
	page: readable({ url: new URL('http://localhost/calendar') })
}));

const afterNavigateCallbacks: Array<() => void> = [];
// oxlint-disable-next-line anti-slop/no-module-mocking -- SvelteKit $app/navigation is a framework virtual module; no DI seam exists.
vi.mock('$app/navigation', () => ({
	goto: vi.fn(() => Promise.resolve()),
	afterNavigate: (cb: () => void) => afterNavigateCallbacks.push(cb)
}));

afterEach(() => {
	cleanup();
	afterNavigateCallbacks.length = 0;
});

// Issue 015: the mobile hamburger is the only way into the nav below `md`.
// Measured, not eyeballed — it is already `h-11 w-11`.
describe('Navbar touch targets', () => {
	it('gives the mobile hamburger a 44px square target', () => {
		render(Navbar, { props: { isLoggedIn: true, user: { firstName: 'Sam' } } });
		const burger = screen.getByText('Open menu').closest('button');
		expect(measureBox(burger?.className ?? '')).toEqual({ width: 44, height: 44 });
	});
});

// Issue 253: navigations not started from a menu link (bell goto, bottom tabs,
// logo) left the hamburger menu covering the new page.
describe('Navbar closes menus after navigation', () => {
	it('closes the mobile menu when any navigation completes', async () => {
		render(Navbar, { props: { isLoggedIn: true, user: { firstName: 'Sam' } } });
		await fireEvent.click(screen.getByText('Open menu').closest('button')!);
		expect(screen.getByText('Close menu')).toBeInTheDocument();
		expect(afterNavigateCallbacks.length).toBeGreaterThan(0);
		afterNavigateCallbacks.forEach((cb) => cb());
		await tick();
		expect(screen.getByText('Open menu')).toBeInTheDocument();
	});
});

// Issue 257: the bug-form link carries the page the user was on.
describe('Navbar report-bug link', () => {
	it('passes the current path as ?from=', async () => {
		render(Navbar, { props: { isLoggedIn: true, user: { firstName: 'Sam' } } });
		await fireEvent.click(screen.getByText('Open menu').closest('button')!);
		expect(screen.getByText('Report a Bug').closest('a')?.getAttribute('href')).toBe(
			'/report-bug?from=%2Fcalendar'
		);
	});
});
