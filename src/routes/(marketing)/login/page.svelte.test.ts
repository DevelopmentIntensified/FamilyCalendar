import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import LoginPage from './+page.svelte';

vi.mock('$app/navigation', () => ({
	goto: vi.fn()
}));

vi.mock('$app/stores', () => ({
	page: { subscribe: vi.fn() }
}));

beforeEach(() => {
	vi.clearAllMocks();
});

afterEach(() => {
	cleanup();
});

describe('/login page URL error display', () => {
	it('shows error message from ?error= query parameter', async () => {
		const mockPageUrl = new URL('http://test.com/login?error=Token+expired');
		const mockPageStore = await import('$app/stores');
		vi.mocked(mockPageStore.page).subscribe = vi.fn((cb: any) => {
			cb({ url: mockPageUrl });
			return () => {};
		});

		render(LoginPage, { props: { data: { isLoggedIn: false, user: null, pathname: '/login' } } });

		expect(screen.getByText('Token expired')).toBeInTheDocument();
	});

	it('does not show error when no ?error= parameter', async () => {
		const mockPageUrl = new URL('http://test.com/login');
		const mockPageStore = await import('$app/stores');
		vi.mocked(mockPageStore.page).subscribe = vi.fn((cb: any) => {
			cb({ url: mockPageUrl });
			return () => {};
		});

		render(LoginPage, { props: { data: { isLoggedIn: false, user: null, pathname: '/login' } } });

		expect(screen.queryByText(/Token expired|Invalid|Error/)).not.toBeInTheDocument();
	});
});
