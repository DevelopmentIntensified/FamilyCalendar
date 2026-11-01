import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import { readable } from 'svelte/store';
import { tick } from 'svelte';
import Layout from './+layout.svelte';
import { pushToast, toasts } from '$lib/client/toasts';

// oxlint-disable-next-line anti-slop/no-module-mocking -- SvelteKit $app/stores is a framework virtual module; no DI seam exists.
vi.mock('$app/stores', () => ({
	page: readable({ url: new URL('http://localhost/account') })
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- SvelteKit $app/navigation is a framework virtual module; no DI seam exists.
vi.mock('$app/navigation', () => ({
	goto: vi.fn(() => Promise.resolve()),
	afterNavigate: vi.fn()
}));

afterEach(() => {
	cleanup();
	toasts.set([]);
});

const data = { user: { firstName: 'Sam', email: 'sam@example.com' } } as never;

// Issue 255: /account pushes toasts (data export) but rendered no Toaster,
// and had no bottom nav on phones.
describe('(calendar)/account layout', () => {
	it('renders toasts pushed by account sections', async () => {
		render(Layout, { props: { data } });
		pushToast({ message: 'Export downloaded.' });
		await tick();
		expect(screen.getByText('Export downloaded.')).toBeInTheDocument();
	});

	it('renders the bottom tab bar', () => {
		render(Layout, { props: { data } });
		expect(screen.getByRole('navigation', { name: 'Primary navigation' })).toBeInTheDocument();
	});
});
