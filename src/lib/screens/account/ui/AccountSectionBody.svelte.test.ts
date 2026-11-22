/**
 * The mounted section's switch: the Calendar section carries the dashboard
 * module switches under its own form — they were one page before the sections
 * split, and the legacy journey clicks `#calendar` and then reads "Dashboard
 * modules" and `input[name="module_<id>"]`. The Dashboard section still shows
 * the same switches alone.
 *
 * Doc: ./README.md#invariants
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import type { AccountSectionModel } from '../account.contract';
import AccountSectionBody from './AccountSectionBody.svelte';

afterEach(cleanup);

const enhance = () => ({ destroy() {} });
const NOW = new Date('2027-03-20T12:00:00.000Z');

const CALENDAR: AccountSectionModel = {
	section: 'calendar',
	settings: {
		weekStart: 'sunday',
		timeZone: 'UTC',
		color: null,
		defaultView: 'dayView',
		defaultCalendarId: null,
		syncEventsToFamilyCalendar: false,
		autoParseEventDetails: true,
		showAdsAsEvents: false
	},
	calendars: [],
	consentHistory: []
};

const DASHBOARD: AccountSectionModel = {
	section: 'dashboard',
	hidden: [],
	modules: [
		{
			id: 'verse',
			label: 'Daily Verse',
			scope: 'personal',
			band: 'info',
			meaning: 'the verse on the day dashboard',
			mounted: true
		},
		{
			id: 'glance',
			label: 'Day at a Glance',
			scope: 'personal',
			band: 'card',
			meaning: 'the day dashboard card',
			mounted: true
		}
	]
};

const baseProps = {
	form: null,
	now: NOW,
	enhance,
	exporting: false,
	onExport: () => {}
};

describe('AccountSectionBody', () => {
	it('shows the dashboard module switches under the calendar settings', () => {
		render(AccountSectionBody, {
			props: { ...baseProps, model: CALENDAR, dashboard: DASHBOARD }
		});

		expect(screen.getByRole('heading', { name: 'Calendar Settings' })).toBeInTheDocument();
		expect(screen.getByRole('heading', { name: 'Dashboard modules' })).toBeInTheDocument();
		expect(document.querySelector('input[name="module_verse"]')).not.toBeNull();
		expect(document.querySelector('input[name="module_glance"]')).not.toBeNull();
	});

	it('shows the calendar form alone until the switches arrive', () => {
		render(AccountSectionBody, { props: { ...baseProps, model: CALENDAR, dashboard: null } });

		expect(screen.getByRole('heading', { name: 'Calendar Settings' })).toBeInTheDocument();
		expect(screen.queryByRole('heading', { name: 'Dashboard modules' })).not.toBeInTheDocument();
	});
});
