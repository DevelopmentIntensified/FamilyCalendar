/**
 * `/login` as the reader meets it: the heading, the Password / Email Link
 * switch, the merge banner, the signed-in landing and the guest footer. Only
 * what renders and what a click changes — the calls live in the state class.
 *
 * Doc: ../README.md#invariants
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import LoginScreen from './LoginScreen.svelte';

afterEach(cleanup);

const redirect = () => {};

function renderLogin(data: { isLoggedIn?: boolean; mergeMode?: boolean } = {}) {
	return render(LoginScreen, {
		data: {
			isLoggedIn: data.isLoggedIn ?? false,
			mergeMode: data.mergeMode ?? false,
			redirectTo: '/calendar'
		},
		redirect,
		cleanUrl: () => {},
		urlError: null,
		urlNotice: null
	});
}

describe('LoginScreen', () => {
	it('welcomes a signed-out visitor with both sign-in forms available', () => {
		renderLogin();
		expect(screen.getByRole('heading', { name: 'Welcome Back' })).toBeTruthy();
		expect(screen.getByLabelText('Email')).toBeTruthy();
		expect(screen.getByLabelText('Password')).toBeTruthy();
		expect(screen.getByText('Start planning — no account needed')).toBeTruthy();
	});

	it('enters the calendar with a full document navigation, which creates the guest', () => {
		renderLogin();
		const link = screen.getByRole('link', { name: 'Start planning — no account needed' });
		expect(link.getAttribute('href')).toBe('/calendar');
		expect(link.hasAttribute('data-sveltekit-reload')).toBe(true);
	});

	it('switches to the email-link form and back', async () => {
		renderLogin();
		await fireEvent.click(screen.getByRole('button', { name: 'Email Link' }));
		expect(screen.getByRole('button', { name: 'Send Login Link' })).toBeTruthy();
		expect(screen.queryByLabelText('Password')).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: 'Password' }));
		expect(screen.getByRole('button', { name: 'Login' })).toBeTruthy();
	});

	it('shows the merge banner to a guest and keeps the form up', () => {
		renderLogin({ mergeMode: true });
		expect(screen.getByText(/merge the calendar you've added on this device/)).toBeTruthy();
		expect(screen.getByLabelText('Password')).toBeTruthy();
		expect(screen.queryByText('Start planning — no account needed')).toBeNull();
	});

	it('offers the calendar to a signed-in visitor instead of a form', () => {
		renderLogin({ isLoggedIn: true });
		expect(screen.getByRole('link', { name: 'Go to Calendar' })).toBeTruthy();
		expect(screen.queryByLabelText('Password')).toBeNull();
	});
});
