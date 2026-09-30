import { render, screen, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readable } from 'svelte/store';
import Navbar from './Navbar.svelte';
import { measureBox } from '$lib/utils/touchTarget';

// oxlint-disable-next-line anti-slop/no-module-mocking -- SvelteKit $app/stores is a framework virtual module; no DI seam exists.
vi.mock('$app/stores', () => ({
	page: readable({ url: new URL('http://localhost/calendar') })
}));

afterEach(cleanup);

// Issue 015: the mobile hamburger is the only way into the nav below `md`.
// Measured, not eyeballed — it is already `h-11 w-11`.
describe('Navbar touch targets', () => {
	it('gives the mobile hamburger a 44px square target', () => {
		render(Navbar, { props: { isLoggedIn: true, user: { firstName: 'Sam' } } });
		const burger = screen.getByText('Open menu').closest('button');
		expect(measureBox(burger?.className ?? '')).toEqual({ width: 44, height: 44 });
	});
});
