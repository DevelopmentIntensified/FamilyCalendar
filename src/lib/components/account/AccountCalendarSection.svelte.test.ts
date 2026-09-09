import { render, screen, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, it, expect, afterEach } from 'vitest';
import AccountCalendarSection from './AccountCalendarSection.svelte';

const settings = {
	weekStart: 'monday',
	timeZone: 'UTC',
	defaultView: 'monthView',
	defaultCalendarId: null,
	color: '#3b82f6',
	syncEventsToFamilyCalendar: false,
	autoParseEventDetails: true,
	showDailyVerse: false,
	verseTranslation: 'esv',
	hiddenDashboardModules: []
};

function props(overrides = {}) {
	return {
		userSettings: { ...settings },
		calendars: [{ id: 'c1', name: 'Mine' }],
		verseTranslations: [{ id: 'esv', label: 'ESV', attribution: 'Public domain.' }],
		...overrides
	};
}

function weekStartValue() {
	// SAFETY: the Week Starts On field is a <select> in AccountCalendarSection.
	return (screen.getByLabelText('Week Starts On') as HTMLSelectElement).value;
}

describe('AccountCalendarSection', () => {
	afterEach(cleanup);

	it('reflects the settings in its fields', () => {
		render(AccountCalendarSection, { props: props() });
		expect(weekStartValue()).toBe('monday');
		expect(screen.getByLabelText('Default View')).toBeTruthy();
		expect(screen.getByText('Dashboard modules')).toBeTruthy();
	});

	it('syncs fields when reloaded settings arrive', async () => {
		const { rerender } = render(AccountCalendarSection, { props: props() });
		expect(weekStartValue()).toBe('monday');
		await rerender({
			props: props({ userSettings: { ...settings, weekStart: 'sunday' } })
		});
		await tick();
		expect(weekStartValue()).toBe('sunday');
	});
});
