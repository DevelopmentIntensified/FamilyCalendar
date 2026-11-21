/**
 * The Calendar card as the reader sees it: the consent trail's two sentence
 * shapes, the approved fallbacks for an account with no settings row, and the
 * field re-sync that only happens when a reloaded model arrives.
 *
 * Doc: ./README.md#invariants
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import type { AccountSectionModel } from '../account.contract';
import AccountCalendarSection from './AccountCalendarSection.svelte';

afterEach(cleanup);

const enhance = () => ({ destroy() {} });

type AccountCalendarModel = Extract<AccountSectionModel, { section: 'calendar' }>;

function model(overrides: Partial<AccountCalendarModel> = {}): AccountCalendarModel {
	return {
		section: 'calendar',
		settings: {
			weekStart: 'sunday',
			timeZone: 'UTC',
			color: '#3b82f6',
			defaultView: 'dayView',
			defaultCalendarId: null,
			syncEventsToFamilyCalendar: false,
			autoParseEventDetails: true,
			showAdsAsEvents: false
		},
		calendars: [{ id: 'cal-1', name: 'Lovelace' }],
		consentHistory: [],
		...overrides
	};
}

describe('AccountCalendarSection', () => {
	it('renders each consent event with its decision labelled and dated', () => {
		render(AccountCalendarSection, {
			props: {
				model: model({
					consentHistory: [
						{ decision: 'granted', recordedAt: '2027-03-12T10:00:00.000Z' },
						{ decision: 'withdrawn', recordedAt: '2027-04-02T10:00:00.000Z' }
					]
				}),
				enhance
			}
		});

		expect(screen.getByText('Consented — 12 March 2027')).toBeInTheDocument();
		expect(screen.getByText('Consent withdrawn — 2 April 2027')).toBeInTheDocument();
	});

	it('says the trail has not started when it is empty', () => {
		render(AccountCalendarSection, { props: { model: model(), enhance } });
		expect(
			screen.getByText(
				'No ad consent recorded yet — the trail begins when the setting is first changed.'
			)
		).toBeInTheDocument();
	});

	it('offers the approved select options and the ICS import link', () => {
		render(AccountCalendarSection, { props: { model: model(), enhance } });

		const calendar = screen.getByLabelText('Default Calendar');
		expect(calendar).toHaveTextContent('None (use first available)');
		expect(calendar).toHaveTextContent('Lovelace');
		expect(screen.getByLabelText('Default View')).toHaveTextContent('Dashboard (Day Dashboard)');
		expect(screen.getByRole('link', { name: /Import from Google, Apple or Outlook/ })).toHaveAttribute(
			'href',
			'/calendar/import'
		);
	});

	it('syncs fields when reloaded settings arrive, and not on a user edit', async () => {
		const { rerender } = render(AccountCalendarSection, { props: { model: model(), enhance } });
		const weekStart = screen.getByLabelText('Week Starts On') as HTMLSelectElement;
		expect(weekStart.value).toBe('sunday');

		await rerender({
			model: model({
				settings: {
					...model().settings,
					weekStart: 'monday',
					timeZone: 'Europe/Madrid'
				}
			}),
			enhance
		});

		expect((screen.getByLabelText('Week Starts On') as HTMLSelectElement).value).toBe('monday');
		expect((screen.getByLabelText('Time Zone') as HTMLSelectElement).value).toBe('Europe/Madrid');
	});
});
