/**
 * The rail as the reader sees it: the ten section links in the approved order,
 * the Report-a-Bug link carrying the section (Q-080 B), and the "Signed in as"
 * card — a guest never shows its placeholder address (`#242`).
 *
 * Doc: ./README.md#invariants
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import type { AccountPersonModel } from '../account.contract';
import AccountSidebar from './AccountSidebar.svelte';

afterEach(cleanup);

const PERSON: AccountPersonModel = {
	id: 'user-1',
	firstName: 'Ada',
	lastName: 'Lovelace',
	email: 'ada@example.test',
	emailVerified: true,
	isAnonymous: false,
	roles: [],
	lastActiveAt: null
};

const GUEST: AccountPersonModel = {
	id: 'user-2',
	firstName: 'Guest',
	lastName: null,
	email: null,
	emailVerified: false,
	isAnonymous: true,
	roles: [],
	lastActiveAt: null
};

describe('AccountSidebar', () => {
	it('links every section in the approved order and marks the active one', () => {
		render(AccountSidebar, { props: { activeSection: 'calendar', user: PERSON } });
		const nav = screen.getByRole('navigation', { name: 'Account sections' });
		const links = nav.querySelectorAll('a[href^="#"]');
		expect([...links].map((link) => [link.getAttribute('href'), link.textContent?.trim()])).toEqual([
			['#profile', 'Profile'],
			['#families', 'Your families'],
			['#notifications', 'Notifications'],
			['#calendar', 'Calendar'],
			['#dashboard', 'Dashboard'],
			['#subscription', 'Plan & usage'],
			['#email', 'Email'],
			['#security', 'Security'],
			['#api', 'API Tokens'],
			['#danger', 'Danger Zone']
		]);
		expect(nav.querySelector('a[href="#calendar"]')).toHaveAttribute('aria-current', 'true');
		expect(nav.querySelector('a[href="#profile"]')).not.toHaveAttribute('aria-current');
	});

	it('carries the current section on the Report a Bug link', () => {
		render(AccountSidebar, { props: { activeSection: 'api', user: PERSON } });
		expect(screen.getByRole('link', { name: 'Report a Bug' })).toHaveAttribute(
			'href',
			`/report-bug?from=${encodeURIComponent('/account#api')}`
		);
	});

	it('prints the signed-in name and address', () => {
		render(AccountSidebar, { props: { activeSection: 'profile', user: PERSON } });
		const card = screen.getByTestId('account-identity');
		expect(card).toHaveTextContent('Ada Lovelace');
		expect(card).toHaveTextContent('ada@example.test');
	});

	it('a guest gets the claim line instead of a placeholder address', () => {
		render(AccountSidebar, { props: { activeSection: 'email', user: GUEST } });
		const card = screen.getByTestId('account-identity');
		expect(card).toHaveTextContent('No email yet');
		expect(card).not.toHaveTextContent('anonymous.placeholder');
		expect(screen.getByRole('link', { name: 'Save your calendar' })).toHaveAttribute(
			'href',
			'/claim'
		);
	});
});
