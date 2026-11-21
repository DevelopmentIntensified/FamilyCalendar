/**
 * Notifications as the reader sees it: four switch buttons in the approved
 * order with their aria-checked state, the toggle flipped the moment it is
 * pressed (before the save answers), the receipt naming the row, and skeleton
 * rows while the loader has not answered.
 *
 * Doc: ./README.md#invariants
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import type { AccountNotificationOptionModel } from '../account.contract';
import AccountNotificationsSection from './AccountNotificationsSection.svelte';

afterEach(cleanup);

const enhance = () => ({ destroy() {} });

const OPTIONS: AccountNotificationOptionModel[] = [
	{ id: 'taskAssigned', label: 'Task assigned to me', hint: 'In-app and push', default: true },
	{ id: 'taskCompleted', label: 'Task completed', hint: 'In-app and push', default: true },
	{ id: 'familyJoined', label: 'Someone joined the family', hint: 'In-app only', default: false },
	{ id: 'aiSuggestions', label: 'AI event suggestions', hint: 'Uses your AI allowance', default: true }
];

const PREFERENCES = {
	taskAssigned: true,
	taskCompleted: true,
	familyJoined: false,
	aiSuggestions: true
};

describe('AccountNotificationsSection', () => {
	it('renders skeleton rows and no switch before the loader answers', () => {
		render(AccountNotificationsSection, {
			props: { preferences: null, options: OPTIONS, enhance }
		});

		expect(screen.queryByRole('switch')).not.toBeInTheDocument();
		const skeleton = screen.getByRole('status');
		expect(skeleton).toHaveTextContent('Loading notification preferences');
	});

	it('renders the four switches in order with their checked state', () => {
		render(AccountNotificationsSection, {
			props: { preferences: PREFERENCES, options: OPTIONS, enhance }
		});

		const switches = screen.getAllByRole('switch');
		expect(switches.map((toggle) => toggle.getAttribute('aria-label'))).toEqual(
			OPTIONS.map((option) => option.label)
		);
		expect(switches.map((toggle) => toggle.getAttribute('aria-checked'))).toEqual([
			'true',
			'true',
			'false',
			'true'
		]);
	});

	it('flips aria-checked the moment it is pressed, before the save answers', async () => {
		render(AccountNotificationsSection, {
			props: { preferences: PREFERENCES, options: OPTIONS, enhance }
		});

		const familySwitch = screen.getByTestId('notification-switch-familyJoined');
		expect(familySwitch).toHaveAttribute('aria-checked', 'false');

		await fireEvent.click(familySwitch);

		expect(familySwitch).toHaveAttribute('aria-checked', 'true');
		expect(screen.getByTestId('notification-status')).toHaveTextContent(
			'Someone joined the family alerts are on.'
		);
	});

	it('keeps the JSON-column note and the way to the alerts', () => {
		render(AccountNotificationsSection, {
			props: { preferences: PREFERENCES, options: OPTIONS, enhance }
		});

		expect(screen.getByTestId('notification-note')).toHaveTextContent(
			'activeSubscriptions.notificationMethods'
		);
		expect(screen.getByRole('link', { name: 'See the alerts' })).toHaveAttribute(
			'href',
			'/calendar/notifications'
		);
	});
});
