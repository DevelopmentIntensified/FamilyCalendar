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
		expect(screen.getByText('Week Starts On')).toBeTruthy();
	});

	it('syncs fields when reloaded settings arrive', async () => {
		const { rerender } = render(AccountCalendarSection, { props: props() });
		expect(weekStartValue()).toBe('monday');
		await rerender(props({ userSettings: { ...settings, weekStart: 'sunday' } }));
		await tick();
		expect(weekStartValue()).toBe('sunday');
	});
});

describe('AccountCalendarSection — the module list moved out (105)', () => {
	afterEach(cleanup);

	// 105 split the Dashboard Module switches into their own section with their
	// own action, because hiding a card and changing your week start were one
	// save. This is the pin for the split: if the switches ever creep back into
	// this form, the server would derive the hidden list from a form that has
	// no module checkboxes — and blank the whole dashboard on any save.
	it('renders no dashboard module switch inside the calendar form', () => {
		render(AccountCalendarSection, { props: props() });
		expect(document.querySelector('input[name^="module_"]')).toBeNull();
		expect(screen.queryByText('Dashboard modules')).toBeNull();
	});

	it('still owns the ad switch, so 088 keeps its consent record (088)', () => {
		// 105's own note: if the module switches leave this form, check 088's
		// seam at the same time rather than leaving the ad switch as the only
		// thing trapped in here. It stays, on purpose — it is the one field
		// whose save also writes a consent record.
		render(AccountCalendarSection, { props: props() });
		expect(document.querySelector('input[name="showAdsAsEvents"]')).toBeTruthy();
	});
});
