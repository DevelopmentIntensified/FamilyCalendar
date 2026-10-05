import { render, cleanup } from '@testing-library/svelte';
import { describe, it, expect, afterEach } from 'vitest';
import AccountSidebar from './AccountSidebar.svelte';
import { ACCOUNT_SECTIONS, resolveAccountSection } from './accountSections';

describe('AccountSidebar — 105: the approved section list', () => {
	afterEach(cleanup);

	it('lists Your families, Notifications, Dashboard and Plan & usage, each reachable by its own hash', () => {
		render(AccountSidebar, { props: { activeSection: 'profile' } });
		const hrefs = [...document.querySelectorAll('nav a[href^="#"]')].map((a) =>
			a.getAttribute('href')
		);
		for (const section of ACCOUNT_SECTIONS) {
			expect(hrefs).toContain(`#${section.id}`);
		}
	});

	it('labels them the way the approved page labels them', () => {
		render(AccountSidebar, { props: { activeSection: 'profile' } });
		const labels = [...document.querySelectorAll('nav a')].map((a) => a.textContent?.trim());
		expect(labels).toContain('Your families');
		expect(labels).toContain('Notifications');
		expect(labels).toContain('Dashboard');
		expect(labels).toContain('Plan & usage');
	});

	it('marks the active section', () => {
		render(AccountSidebar, { props: { activeSection: 'dashboard' } });
		const on = document.querySelector('nav a[href="#dashboard"]')!;
		expect(on.className).toContain('bg-primary-50');
		expect(document.querySelector('nav a[href="#profile"]')!.className).not.toContain(
			'bg-primary-50'
		);
	});

	it('keeps Report a Bug reachable, outside the section list', () => {
		render(AccountSidebar, { props: { activeSection: 'profile' } });
		expect(document.querySelector('a[href="/report-bug"]')).toBeTruthy();
	});
});

describe('resolveAccountSection', () => {
	it('renders the section a hash names', () => {
		expect(resolveAccountSection('#dashboard')).toBe('dashboard');
		expect(resolveAccountSection('#families')).toBe('families');
		expect(resolveAccountSection('#notifications')).toBe('notifications');
	});

	it('falls back to the first section rather than rendering nothing', () => {
		// A stale bookmark — a hash from a section that was renamed, or never
		// shipped — shows the page instead of a blank panel.
		expect(resolveAccountSection('')).toBe('profile');
		expect(resolveAccountSection('#meals')).toBe('profile');
	});
});
