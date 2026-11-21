/**
 * The page body as the reader sees it: the chrome, the section the hash names,
 * the one banner (a signed-out POST's `error` reads as a red banner, never an
 * empty one), and the guest claim link.
 *
 * Doc: ./README.md#invariants
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import type { AccountPagePaint } from '../account.contract';
import AccountScreen from './AccountScreen.svelte';

afterEach(cleanup);

const enhance = () => ({ destroy() {} });

const DATA: AccountPagePaint = {
	now: '2027-03-20T12:00:00.000Z',
	user: {
		id: 'user-1',
		firstName: 'Ada',
		lastName: 'Lovelace',
		email: 'ada@example.test',
		emailVerified: true,
		isAnonymous: false,
		roles: [],
		lastActiveAt: null
	},
	section: {
		section: 'profile',
		person: {
			id: 'user-1',
			firstName: 'Ada',
			lastName: 'Lovelace',
			email: 'ada@example.test',
			emailVerified: true,
			isAnonymous: false,
			roles: [],
			lastActiveAt: null
		}
	}
};

describe('AccountScreen', () => {
	it('renders the approved chrome and the section the hash names', () => {
		render(AccountScreen, { props: { data: DATA, form: null, enhance, hash: '#profile' } });

		expect(screen.getByRole('heading', { name: 'Account Settings' })).toBeInTheDocument();
		expect(screen.getByRole('link', { name: /Back to Calendar/ })).toHaveAttribute(
			'href',
			'/calendar'
		);
		expect(screen.getByRole('heading', { name: 'Profile Information' })).toBeInTheDocument();
	});

	it('renders the families section for its hash', () => {
		render(AccountScreen, {
			props: {
				data: {
					...DATA,
					section: {
						section: 'families',
						families: [
							{ id: 'f-1', name: 'Lovelace', role: 'owner', memberType: 'parent', memberCount: 2 }
						]
					}
				},
				form: null,
				enhance,
				hash: '#families'
			}
		});

		expect(screen.getByRole('heading', { name: 'Your families' })).toBeInTheDocument();
		expect(screen.getByRole('link', { name: /Lovelace/ })).toHaveAttribute('href', '/family/f-1');
	});

	it('shows a signed-out action answer as its error text, not an empty red banner', () => {
		render(AccountScreen, {
			props: {
				data: DATA,
				form: { success: false, error: 'Not signed in' },
				enhance,
				hash: '#profile'
			}
		});

		expect(screen.getByText('Not signed in')).toBeInTheDocument();
	});

	it('falls back to the approved sentence when a failure names nothing', () => {
		render(AccountScreen, {
			props: { data: DATA, form: { success: false }, enhance, hash: '#profile' }
		});
		expect(
			screen.getByText('Something went wrong. Please try again.')
		).toBeInTheDocument();
	});

	it('adds the claim link to a guest-refusal banner', () => {
		render(AccountScreen, {
			props: {
				data: DATA,
				form: {
					success: false,
					message:
						"You're using a guest calendar — add your first email from the Save-your-calendar banner instead.",
					guestNeedsClaim: true
				},
				enhance,
				hash: '#profile'
			}
		});

		expect(
			screen.getByRole('link', { name: /Open the save-your-calendar flow/ })
		).toHaveAttribute('href', '/claim');
	});

	it('shows the green banner for a success message', () => {
		render(AccountScreen, {
			props: {
				data: DATA,
				form: { success: true, message: 'Profile updated successfully' },
				enhance,
				hash: '#profile'
			}
		});
		expect(screen.getByText('Profile updated successfully')).toBeInTheDocument();
	});
});
