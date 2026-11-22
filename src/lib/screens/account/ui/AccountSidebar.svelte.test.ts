/**
 * The rail as the reader sees it: the ten section links in the approved order,
 * the Report-a-Bug link carrying the section (Q-080 B), and the "Signed in as"
 * card — a guest never shows its placeholder address (`#242`).
 *
 * A click hands its section to the screen (`onSelect`), because the hydrated
 * page's hash click moves the URL without a `hashchange` event — the e2e
 * journeys click these links and then look for the section.
 *
 * Doc: ./README.md#invariants
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
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
		render(AccountSidebar, { props: { activeSection: 'calendar', user: PERSON, onSelect: () => {} } });
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
		render(AccountSidebar, { props: { activeSection: 'api', user: PERSON, onSelect: () => {} } });
		expect(screen.getByRole('link', { name: 'Report a Bug' })).toHaveAttribute(
			'href',
			`/report-bug?from=${encodeURIComponent('/account#api')}`
		);
	});

	it('prints the signed-in name and address', () => {
		render(AccountSidebar, { props: { activeSection: 'profile', user: PERSON, onSelect: () => {} } });
		const card = screen.getByTestId('account-identity');
		expect(card).toHaveTextContent('Ada Lovelace');
		expect(card).toHaveTextContent('ada@example.test');
	});

	it('a guest gets the claim line instead of a placeholder address', () => {
		render(AccountSidebar, { props: { activeSection: 'email', user: GUEST, onSelect: () => {} } });
		const card = screen.getByTestId('account-identity');
		expect(card).toHaveTextContent('No email yet');
		expect(card).not.toHaveTextContent('anonymous.placeholder');
		expect(screen.getByRole('link', { name: 'Save your calendar' })).toHaveAttribute(
			'href',
			'/claim'
		);
	});

	it('hands a clicked link’s section to the screen, not only the fragment', async () => {
		const onSelect = vi.fn();
		render(AccountSidebar, { props: { activeSection: 'profile', user: PERSON, onSelect } });

		const security = screen.getByRole('link', { name: 'Security' });
		expect(security).toHaveAttribute('href', '#security');
		await fireEvent.click(security);

		expect(onSelect).toHaveBeenCalledOnce();
		expect(onSelect).toHaveBeenCalledWith('security');
	});
});
