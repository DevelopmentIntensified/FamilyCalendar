/**
 * Plan & usage as the reader sees it: one `/pricing` link per reader — a paid
 * plan changes plan from the card, a free plan upgrades from the Family Master
 * block. Two at once made the leaf `a[href="/pricing"]` ambiguous, which the
 * legacy journey (`SettingsPage.test.ts:77`) treats as a failure.
 *
 * Doc: ./README.md#invariants
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import type { AccountSectionModel } from '../account.contract';
import AccountSubscriptionSection from './AccountSubscriptionSection.svelte';

afterEach(cleanup);

const NOW = new Date('2027-03-20T12:00:00.000Z');

const FREE: Extract<AccountSectionModel, { section: 'subscription' }> = {
	section: 'subscription',
	subscription: { tier: null, subscription: null },
	planLimits: {
		familyLimit: 1,
		memberLimit: 5,
		retentionViewDays: 30,
		archivedRetentionDays: 90,
		attachmentLimitBytes: 5_000_000,
		aiEventCreationsPerMonth: 10,
		exportImportEnabled: false
	},
	aiUsage: { used: 0, limit: 10, remaining: 10 },
	planPricing: { monthly: 9, annual: 90, lifetime: 150, monthlyEquivalent: 7.5 },
	families: []
};

const PAID: Extract<AccountSectionModel, { section: 'subscription' }> = {
	...FREE,
	subscription: {
		tier: {
			id: 'tier-1',
			name: 'family_master',
			tierName: 'family_master',
			planType: 'subscription',
			displayName: 'Family Master',
			createdAt: '2026-01-01T00:00:00.000Z',
			updatedAt: '2026-01-01T00:00:00.000Z',
			durationMonths: 12,
			enabled: true,
			familyLimit: 10,
			memberLimit: 50,
			retentionViewDays: 3650,
			archivedRetentionDays: 3650,
			attachmentLimitBytes: 50_000_000,
			aiEventCreationsPerMonth: 999999,
			exportImportEnabled: true
		},
		subscription: {
			id: 'sub-1',
			startDate: '2026-01-01T00:00:00.000Z',
			endDate: '2027-01-01T00:00:00.000Z',
			createdAt: '2026-01-01T00:00:00.000Z'
		}
	}
};

describe('AccountSubscriptionSection', () => {
	it('a free plan upgrades from the Family Master block, its one pricing link', () => {
		render(AccountSubscriptionSection, { props: { model: FREE, now: NOW } });

		const links = document.querySelectorAll('a[href="/pricing"]');
		expect(links).toHaveLength(1);
		expect(links[0]).toHaveTextContent('See Plans & Pricing');
		expect(document.body).toHaveTextContent('Family Master');
		expect(document.body).toHaveTextContent("You're on the Free plan.");
	});

	it('a paid plan changes plan from the card, its one pricing link', () => {
		render(AccountSubscriptionSection, { props: { model: PAID, now: NOW } });

		const links = document.querySelectorAll('a[href="/pricing"]');
		expect(links).toHaveLength(1);
		expect(links[0]).toHaveTextContent('Change plan');
		// The upgrade block is for a reader who has something to upgrade to.
		expect(document.body).not.toHaveTextContent('See Plans & Pricing');
		expect(document.body).not.toHaveTextContent('Checkout opens soon');
	});
});
