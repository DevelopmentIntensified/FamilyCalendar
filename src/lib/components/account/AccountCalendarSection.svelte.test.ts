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

describe('AccountCalendarSection — the module list has two bands (080)', () => {
	afterEach(cleanup);

	function moduleChecked(id: string) {
		return (document.querySelector(`input[name="module_${id}"]`) as HTMLInputElement).checked;
	}

	function bandOf(id: string) {
		// Document order: the last heading seen before this module's checkbox
		// is the band it renders in.
		let heading: string | null = null;
		for (const node of document.querySelectorAll('h4, input[name^="module_"]')) {
			if (node.tagName === 'H4') heading = node.textContent?.trim() ?? null;
			else if (node.getAttribute('name') === `module_${id}`) return heading;
		}
		return undefined;
	}

	it('puts the verse above the cards and the cards under their own heading', () => {
		render(AccountCalendarSection, { props: props() });
		expect(bandOf('verse')).toBe('Above your cards');
		expect(bandOf('board')).toBe('Cards');
	});

	it('says what the verse switch now means', () => {
		render(AccountCalendarSection, { props: props() });
		const row = document.querySelector('input[name="module_verse"]')!.closest('label')!;
		expect(row.textContent).toContain('Show the verse on your Day Dashboard.');
	});

	it('a saved hidden state unchecks the verse and leaves the cards alone', () => {
		render(AccountCalendarSection, {
			props: props({ userSettings: { ...settings, hiddenDashboardModules: ['verse'] } })
		});
		expect(moduleChecked('verse')).toBe(false);
		expect(moduleChecked('board')).toBe(true);
		expect(moduleChecked('glance')).toBe(true);
	});
});

