import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import LoginPage from './+page.svelte';

// oxlint-disable-next-line anti-slop/no-module-mocking -- SvelteKit $app/navigation is framework-injected; no DI seam exists.
vi.mock('$app/navigation', () => ({
	goto: vi.fn()
}));

const mockPageState = vi.hoisted(() => ({
	url: new URL('http://test.com/login')
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- SvelteKit $app/state is framework-injected; no DI seam exists.
vi.mock('$app/state', () => ({
	page: mockPageState
}));

beforeEach(() => {
	vi.clearAllMocks();
	mockPageState.url = new URL('http://test.com/login');
});

afterEach(() => {
	cleanup();
});

describe('/login page URL error display', () => {
	it('shows error message from ?error= query parameter', async () => {
		mockPageState.url = new URL('http://test.com/login?error=Token+expired');

		render(LoginPage, {
			props: { data: { isLoggedIn: false, user: null, pathname: '/login', mergeMode: false } }
		});

		expect(screen.getByText('Token expired')).toBeInTheDocument();
	});

	it('does not show error when no ?error= parameter', async () => {
		render(LoginPage, {
			props: { data: { isLoggedIn: false, user: null, pathname: '/login', mergeMode: false } }
		});

		expect(screen.queryByText(/Token expired|Invalid|Error/)).not.toBeInTheDocument();
	});
});
