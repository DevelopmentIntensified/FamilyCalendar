/**
 * The module's eight page bodies, rendered from props: each one's h1 (the
 * visual check's `ready` selector), the copy each page exists for, the `/android`
 * states (coming soon, then the repo + APK), and the `/contact` flow — the
 * pending "Sending...", the inline refusal and the "Message Sent!" swap.
 *
 * Doc: ../README.md#invariants
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { androidRelease, type PublishedRepo } from '../marketing.android.rules';
import type { ContactSendResult } from '../marketing.api';
import { CHANGELOG_ENTRIES, changelogNewestFirst } from '../marketing.content.rules';
import AboutScreen from './AboutScreen.svelte';
import AndroidScreen from './AndroidScreen.svelte';
import ChangelogScreen from './ChangelogScreen.svelte';
import ContactScreen from './ContactScreen.svelte';
import FeaturesScreen from './FeaturesScreen.svelte';
import HomeScreen from './HomeScreen.svelte';
import PrivacyScreen from './PrivacyScreen.svelte';
import RoadmapScreen from './RoadmapScreen.svelte';

afterEach(cleanup);

const FP = 'E59447D790A760573B59FA0769F7A073C91142F3FA61D3B775B2486824E571EF';

const published: PublishedRepo = {
	fingerprint: FP,
	repoUrl: 'https://www.familyplanz.com/fdroid/repo',
	latest: {
		apk: 'com.familyplanz.app_4000.apk',
		versionName: '0.4.0',
		versionCode: 4000,
		sha256: 'a3d793dd6f0b2a7cb5f73ea81783212a8bb892b0674fca39947638637c74a0b3',
		size: 3_400_000,
		publishedAt: '2026-11-03T02:30:20Z'
	}
};

const cases: { name: string; h1: string; mount: () => void }[] = [
	{ name: 'HomeScreen', h1: 'Where family schedules come together', mount: () => render(HomeScreen) },
	{ name: 'AboutScreen', h1: 'About Family Planz', mount: () => render(AboutScreen) },
	{
		name: 'AndroidScreen',
		h1: 'Family Planz for Android',
		mount: () => render(AndroidScreen, { props: { release: androidRelease(published) } })
	},
	{ name: 'ChangelogScreen', h1: "What's new in Family Planz", mount: () => render(ChangelogScreen) },
	{
		name: 'ContactScreen',
		h1: 'Contact Us',
		mount: () =>
			render(ContactScreen, {
				props: { api: { send: async () => ({ ok: true, data: { success: true } }) } }
			})
	},
	{ name: 'FeaturesScreen', h1: 'Everything your family needs', mount: () => render(FeaturesScreen) },
	{ name: 'PrivacyScreen', h1: 'Privacy Policy', mount: () => render(PrivacyScreen) },
	{ name: 'RoadmapScreen', h1: 'Roadmap', mount: () => render(RoadmapScreen) }
];

it.each(cases)('$name renders its h1', ({ h1, mount }) => {
	mount();
	const rendered = (document.querySelector('h1')?.textContent ?? '').replace(/\s+/g, ' ').trim();
	expect(rendered).toBe(h1);
});

describe('HomeScreen', () => {
	it('offers the two hero CTAs and the closing signup', () => {
		render(HomeScreen);

		expect(screen.getByText('Start Free Today').getAttribute('href')).toBe('/signup');
		expect(screen.getByText('See Features').getAttribute('href')).toBe('/features');
		expect(screen.getByText('Start Free for Your Family').getAttribute('href')).toBe('/signup');
	});
});

describe('FeaturesScreen', () => {
	it('renders six feature cards, three moments, both struggle panels and three testimonials', () => {
		render(FeaturesScreen);

		expect(screen.getByText('Shared Family Calendar')).toBeInTheDocument();
		expect(screen.getByText('RSVP to Events')).toBeInTheDocument();
		expect(screen.getByText('Morning routines')).toBeInTheDocument();
		expect(screen.getByText('Family time')).toBeInTheDocument();
		expect(screen.getByText('Before Family Planz')).toBeInTheDocument();
		expect(screen.getByText('With Family Planz')).toBeInTheDocument();
		expect(screen.getByText('Sarah M.')).toBeInTheDocument();
		expect(screen.getByText('Jessica L.')).toBeInTheDocument();
		expect(document.querySelectorAll('img')).toHaveLength(3);
	});
});

describe('ChangelogScreen', () => {
	it('starts with the newest entry and prints the long UTC date', () => {
		render(ChangelogScreen);

		const newest = changelogNewestFirst(CHANGELOG_ENTRIES)[0];
		const first = document.querySelector('time');
		expect(first?.getAttribute('datetime')).toBe(newest.date);
		expect(first?.textContent?.trim()).toMatch(/^[A-Z][a-z]+ \d{1,2}, \d{4}$/);
		expect(screen.getByText(newest.title)).toBeInTheDocument();
	});
});

describe('RoadmapScreen', () => {
	it('shows the three sections and the "planned, not promised" note', () => {
		render(RoadmapScreen);

		for (const headingText of ['Shipped', 'In progress', 'Coming next']) {
			expect(screen.getByText(headingText)).toBeInTheDocument();
		}
		expect(document.body.textContent).toContain('This roadmap is planned, not promised');
		expect(screen.getByText('Get in touch').getAttribute('href')).toBe('/contact');
	});
});

describe('PrivacyScreen', () => {
	it('carries the updated line, the children’s paragraph and the services table', () => {
		render(PrivacyScreen);

		expect(screen.getByText('Last updated: October 2026')).toBeInTheDocument();
		expect(screen.getByText("Children's data")).toBeInTheDocument();
		expect(screen.getByText('Cerebras')).toBeInTheDocument();
		expect(screen.getByText('OpenStreetMap Nominatim')).toBeInTheDocument();
	});
});

describe('AndroidScreen', () => {
	it('says "coming soon" and links nothing before the first publish', () => {
		render(AndroidScreen, {
			props: {
				release: androidRelease({
					fingerprint: null,
					repoUrl: 'https://www.familyplanz.com/fdroid/repo',
					latest: null
				})
			}
		});

		expect(document.querySelector('[data-testid="no-release"]')).not.toBeNull();
		expect(document.querySelector('[data-testid="add-repo"]')).toBeNull();
		expect(document.querySelector('[data-testid="download-apk"]')).toBeNull();
	});

	it('links the repo, the fingerprint and the APK once a build is published', () => {
		render(AndroidScreen, { props: { release: androidRelease(published) } });

		const add = document.querySelector('[data-testid="add-repo"]');
		expect(add?.getAttribute('href')).toBe(
			`fdroidrepos://www.familyplanz.com/fdroid/repo?fingerprint=${FP}`
		);
		expect(document.querySelector('[data-testid="fingerprint"]')?.textContent?.trim()).toBe(
			androidRelease(published).repo?.fingerprintGrouped
		);
		const apk = document.querySelector('[data-testid="download-apk"]');
		expect(apk?.getAttribute('href')).toBe('/fdroid/repo/com.familyplanz.app_4000.apk');
		expect(apk?.textContent).toContain('Download Family Planz 0.4.0 (3.4 MB)');
	});
});

describe('ContactScreen', () => {
	it('says "Sending..." while the request is in flight, then shows the success card', async () => {
		const early = Promise.withResolvers<ContactSendResult>();
		render(ContactScreen, { props: { api: { send: () => early.promise } } });
		fillForm();

		await fireEvent.submit(form());

		expect(await screen.findByText('Sending...')).toBeInTheDocument();
		early.resolve({ ok: true, data: { success: true } });
		expect(await screen.findByText('Message Sent!')).toBeInTheDocument();

		await fireEvent.click(screen.getByText('Send another message'));
		expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('');
		expect(screen.getByText('Send Message')).toBeInTheDocument();
	});

	it('shows the refusal sentence inline and keeps the fields', async () => {
		render(ContactScreen, {
			props: { api: { send: async () => ({ ok: false, status: 400, error: 'All fields are required' }) } }
		});
		fillForm();

		await fireEvent.submit(form());

		expect(await screen.findByText('All fields are required')).toBeInTheDocument();
		expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Alex');
	});
});

function form(): HTMLFormElement {
	const element = document.querySelector('form');
	if (!element) throw new Error('the contact form is not rendered');
	return element;
}

function fillForm(): void {
	fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Alex' } });
	fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'alex@example.com' } });
	fireEvent.input(screen.getByLabelText('Message'), { target: { value: 'Hi there' } });
}
