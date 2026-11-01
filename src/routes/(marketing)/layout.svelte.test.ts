import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import { readable } from 'svelte/store';
import Layout from './+layout.svelte';

// oxlint-disable-next-line anti-slop/no-module-mocking -- SvelteKit $app/stores is a framework virtual module; no DI seam exists.
vi.mock('$app/stores', () => ({
	page: readable({ url: new URL('http://localhost/pricing') })
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- SvelteKit $app/navigation is a framework virtual module; no DI seam exists.
vi.mock('$app/navigation', () => ({
	goto: vi.fn(() => Promise.resolve()),
	afterNavigate: vi.fn()
}));

afterEach(cleanup);

// Issue 254: the marketing layout dropped `user`, so signed-in visitors saw
// "U / User" and no admin links on /pricing etc.
describe('(marketing) layout navbar', () => {
	it('passes the signed-in user to the navbar', async () => {
		render(Layout, {
			props: {
				data: {
					pathname: '/pricing',
					origin: 'http://localhost',
					isLoggedIn: true,
					user: { firstName: 'Sam', lastName: 'Lee', email: 'sam@example.com', roles: ['admin'] }
				}
			}
		});
		expect(screen.getByText('Sam')).toBeInTheDocument();
		expect(screen.queryByText('User')).not.toBeInTheDocument();
		await fireEvent.click(screen.getByText('Open menu').closest('button')!);
		expect(document.querySelector('a[href="/admin/bugs"]')).not.toBeNull();
	});
});
