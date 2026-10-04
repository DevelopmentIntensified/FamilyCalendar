import { render, screen, cleanup } from '@testing-library/svelte';
import { describe, it, expect, afterEach } from 'vitest';
import { DASHBOARD_MODULES } from '$lib/dashboardModules';
import AccountDashboardSection from './AccountDashboardSection.svelte';

function props(hiddenDashboardModules: string[] | null = []) {
	return { hiddenDashboardModules };
}

function moduleChecked(id: string) {
	// SAFETY: every module id gets one checkbox, and the id came from the
	// canonical list, so the query always finds exactly one input.
	return (document.querySelector(`input[name="module_${id}"]`) as HTMLInputElement).checked;
}

function bandOf(id: string) {
	// Document order: the last heading seen before this module's checkbox is the
	// band it renders in.
	let heading: string | null = null;
	for (const node of document.querySelectorAll('h3, input[name^="module_"]')) {
		if (node.tagName === 'H3') heading = node.textContent?.trim() ?? null;
		else if (node.getAttribute('name') === `module_${id}`) return heading;
	}
	return undefined;
}

describe('AccountDashboardSection — 105: its own section, its own save', () => {
	afterEach(cleanup);

	it('is its own form, posting to its own action', () => {
		// The complaint was that hiding a dashboard card and changing your week
		// start were one save. That is only fixed if this posts somewhere else.
		render(AccountDashboardSection, { props: props() });
		const form = document.querySelector('form')!;
		expect(form.getAttribute('action')).toContain('saveDashboardModules');
		expect(form.getAttribute('action')).not.toContain('saveCalendarSettings');
		expect(form.querySelector('select[name="weekStart"]')).toBeNull();
		expect(form.querySelector('input[name="showAdsAsEvents"]')).toBeNull();
	});

	it('renders one switch per canonical module', () => {
		render(AccountDashboardSection, { props: props() });
		expect(document.querySelectorAll('input[name^="module_"]')).toHaveLength(
			DASHBOARD_MODULES.length
		);
	});

	it('says what each switch means', () => {
		render(AccountDashboardSection, { props: props() });
		const row = document.querySelector('input[name="module_verse"]')!.closest('label')!;
		expect(row.textContent).toContain('Show the verse on your Day Dashboard.');
	});

	it('puts the verse above the cards and the cards under their own heading', () => {
		render(AccountDashboardSection, { props: props() });
		expect(bandOf('verse')).toBe('Above your cards');
		expect(bandOf('board')).toBe('Cards');
	});

	it('reads a saved hidden list as unchecked switches', () => {
		render(AccountDashboardSection, { props: props(['verse', 'board']) });
		expect(moduleChecked('verse')).toBe(false);
		expect(moduleChecked('board')).toBe(false);
		expect(moduleChecked('kids')).toBe(true);
	});

	it('ignores a retired module id in a saved list (103)', () => {
		render(AccountDashboardSection, { props: props(['memberStrip']) });
		expect(document.querySelector('input[name="module_memberStrip"]')).toBeNull();
		expect(document.querySelectorAll('input[name^="module_"]')).toHaveLength(
			DASHBOARD_MODULES.length
		);
		expect(moduleChecked('board')).toBe(true);
	});

	// 105 rerun: the approved page's subtitle is "personal · overrides the
	// family setting". It replaced the app's longer sentence, which said the
	// same thing in a paragraph; the meaning is unchanged.
	it('says the setting is personal, and that it overrides the family setting', () => {
		render(AccountDashboardSection, { props: props() });
		expect(screen.getByTestId('dashboard-subtitle').textContent).toContain(
			'personal · overrides the family setting'
		);
	});
});
