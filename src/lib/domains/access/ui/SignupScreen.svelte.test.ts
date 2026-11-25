/**
 * `/signup`'s guest footer: "Start planning — no account needed" must be a
 * document navigation, because only a document request creates the Anonymous
 * Account (a client-side `__data.json` fetch does not).
 *
 * Doc: ../README.md#invariants
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import SignupScreen from './SignupScreen.svelte';

afterEach(cleanup);

function renderSignup(isLoggedIn: boolean) {
	return render(SignupScreen, {
		data: { isLoggedIn, redirectTo: '/calendar' },
		redirect: () => {}
	});
}

describe('SignupScreen guest footer', () => {
	it('enters the calendar with a full document navigation', () => {
		renderSignup(false);
		const link = screen.getByRole('link', { name: 'Start planning — no account needed' });
		expect(link.getAttribute('href')).toBe('/calendar');
		expect(link.hasAttribute('data-sveltekit-reload')).toBe(true);
	});

	it('hides the guest entry from a signed-in visitor', () => {
		renderSignup(true);
		expect(screen.queryByText('Start planning — no account needed')).toBeNull();
	});
});
