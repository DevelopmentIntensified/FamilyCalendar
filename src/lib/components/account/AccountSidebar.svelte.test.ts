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

describe('AccountSidebar — 129: the prototype rail, measured', () => {
	afterEach(cleanup);

	it('wears the rail__card chrome: 1.25rem radius, 1px slate border, white, 1rem padding', () => {
		render(AccountSidebar, { props: { activeSection: 'profile' } });
		const card = document.querySelector('nav[data-testid="account-rail-card"]')!;
		expect(card.className).toContain('rounded-[1.25rem]');
		expect(card.className).toContain('border border-slate-200');
		expect(card.className).toContain('bg-white');
		expect(card.className).toContain('p-4');
	});

	it('stacks the nav card and the identity card 1rem apart', () => {
		render(AccountSidebar, { props: { activeSection: 'profile', user: { email: 'a@b.c' } } });
		const rail = document.querySelector('[data-testid="account-rail"]')!;
		expect(rail.className).toContain('gap-4');
	});

	it('sets the rail__title at .08em, not the old .1em widest', () => {
		render(AccountSidebar, { props: { activeSection: 'profile' } });
		const title = document.querySelector('[data-testid="account-rail-title"]')!;
		expect(title.className).toContain('tracking-[0.08em]');
		expect(title.className).not.toContain('tracking-widest');
	});

	it('wears the blush #FED5CF avatar, not Tailwind orange-100', () => {
		render(AccountSidebar, { props: { activeSection: 'profile', user: { email: 'a@b.c' } } });
		const avatar = document.querySelector('[data-testid="account-initial"]')!;
		expect(avatar.className).toContain('bg-[#FED5CF]');
		expect(avatar.className).toContain('text-[#c45e38]');
		expect(avatar.className).not.toContain('orange');
	});

	it('drops the avatar to the 700 weight against the box-shadow-free reference', () => {
		render(AccountSidebar, { props: { activeSection: 'profile', user: { email: 'a@b.c' } } });
		const avatar = document.querySelector('[data-testid="account-initial"]')!;
		expect(avatar.className).toContain('font-bold');
		expect(avatar.className).not.toContain('font-extrabold');
	});

	it('frames the signed-in-as card like the nav card above it', () => {
		render(AccountSidebar, { props: { activeSection: 'profile', user: { email: 'a@b.c' } } });
		const identity = document.querySelector('[data-testid="account-identity"]')!;
		expect(identity.className).toContain('rounded-[1.25rem]');
		expect(identity.className).toContain('border border-slate-200');
	});

	it('sits the rows at the .625rem snav radius', () => {
		render(AccountSidebar, { props: { activeSection: 'profile' } });
		const row = document.querySelector('nav[data-testid="account-rail-card"] a')!;
		expect(row.className).toContain('rounded-[0.625rem]');
		expect(row.className).not.toContain('rounded-lg');
	});

	it('reads the danger section stop like every other row, as the snav rows are uniform', () => {
		render(AccountSidebar, { props: { activeSection: 'profile' } });
		const danger = document.querySelector('a[href="#danger"]')!;
		expect(danger.className).toContain('text-slate-600');
		expect(danger.className).not.toContain('text-red-600');
		expect(danger.className).not.toContain('text-red-700');
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
