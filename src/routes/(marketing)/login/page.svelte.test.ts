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

describe('/login honours data.redirectTo (#244)', () => {
	it('password login lands on the redirect target, not /calendar', async () => {
		const { goto } = await import('$app/navigation');
		const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true })));
		vi.stubGlobal('fetch', fetchMock);
		render(LoginPage, {
			props: {
				data: {
					isLoggedIn: false,
					user: null,
					origin: 'http://test.com',
					pathname: '/login',
					mergeMode: false,
					redirectTo: '/family/join/ABC123'
				}
			}
		});
		const { fireEvent } = await import('@testing-library/svelte');
		await fireEvent.submit(document.querySelector('form')!);
		await vi.waitFor(() =>
			expect(goto).toHaveBeenCalledWith('/family/join/ABC123', { invalidateAll: true })
		);
		vi.unstubAllGlobals();
	});

	it('the sign-up link carries the redirect forward', () => {
		render(LoginPage, {
			props: {
				data: {
					isLoggedIn: false,
					user: null,
					origin: 'http://test.com',
					pathname: '/login',
					mergeMode: false,
					redirectTo: '/family/join/ABC123'
				}
			}
		});
		const signup = document.querySelector('a[href^="/signup"]')!;
		expect(signup.getAttribute('href')).toBe('/signup?redirect=%2Ffamily%2Fjoin%2FABC123');
	});
});

describe('/login page URL error display', () => {
	it('shows error message from ?error= query parameter', async () => {
		mockPageState.url = new URL('http://test.com/login?error=Token+expired');

		render(LoginPage, {
			props: { data: { isLoggedIn: false, user: null, origin: 'http://test.com', pathname: '/login', mergeMode: false, redirectTo: '/calendar' } }
		});

		expect(screen.getByText('Token expired')).toBeInTheDocument();
	});

	it('does not show error when no ?error= parameter', async () => {
		render(LoginPage, {
			props: { data: { isLoggedIn: false, user: null, origin: 'http://test.com', pathname: '/login', mergeMode: false, redirectTo: '/calendar' } }
		});

		expect(screen.queryByText(/Token expired|Invalid|Error/)).not.toBeInTheDocument();
	});
});
