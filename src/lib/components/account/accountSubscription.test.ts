import { describe, it, expect } from 'vitest';
import {
	formatBytesLabel,
	lastUsedLabel,
	renewalDateLabel,
	subscriptionPeriodLabel,
	usageLine
} from './accountSubscription';

describe('formatBytesLabel', () => {
	it('renders em-dash for missing, MB over a megabyte, KB below', () => {
		expect(formatBytesLabel(null)).toBe('—');
		expect(formatBytesLabel(undefined)).toBe('—');
		expect(formatBytesLabel(0)).toBe('—');
		expect(formatBytesLabel(2048)).toBe('2KB');
		expect(formatBytesLabel(5 * 1048576)).toBe('5MB');
	});
});

describe('subscriptionPeriodLabel', () => {
	const day = (iso: string) => new Date(iso);
	it('names the no-plan and bare-active states', () => {
		expect(subscriptionPeriodLabel(false, null)).toBe('No subscription yet');
		expect(
			subscriptionPeriodLabel(true, {
				tier: { durationMonths: 1 },
				row: null
			})
		).toBe('Active');
	});

	it('distinguishes lifetime from renewing plans', () => {
		const lifetime = subscriptionPeriodLabel(true, {
			tier: { durationMonths: 999 },
			row: { startDate: day('2026-01-05'), endDate: day('2036-01-05') }
		});
		expect(lifetime).toContain('Lifetime access');
		const monthly = subscriptionPeriodLabel(true, {
			tier: { durationMonths: 1 },
			row: { startDate: day('2026-01-05'), endDate: day('2026-02-05') }
		});
		expect(monthly).toContain('renews');
	});
});

describe('usageLine', () => {
	// 105: the plan section keeps the usage line the approved page shows.
	it('reads a real count against a real limit', () => {
		expect(usageLine(3, 5)).toBe('3 of 5');
	});

	it('says Unlimited rather than inventing a ceiling', () => {
		expect(usageLine(3, 999)).toBe('Unlimited');
		expect(usageLine(3, null)).toBe('Unlimited');
		expect(usageLine(3, 0)).toBe('Unlimited');
	});
});

describe('renewalDateLabel', () => {
	// 105 rerun: the approved plan card carries a "Renews 12 March 2027" line
	// under the plan name. The app folded that date into a single period
	// sentence instead, so the one date a reader actually wants — when they are
	// next charged — had to be dug out of it.
	const day = (iso: string) => new Date(iso);

	it('names the next renewal date on its own line', () => {
		expect(renewalDateLabel({ startDate: day('2026-01-05'), endDate: day('2027-03-12') })).toContain(
			'Renews'
		);
		expect(renewalDateLabel({ startDate: day('2026-01-05'), endDate: day('2027-03-12') })).toContain(
			'2027'
		);
	});

	it('says a lifetime plan never renews instead of printing its end date', () => {
		// A lifetime tier has an endDate column like any other row; printing it
		// as "Renews" would promise a charge that is never coming.
		expect(
			renewalDateLabel(
				{ startDate: day('2026-01-05'), endDate: day('2036-01-05') },
				999
			)
		).toMatch(/never renews/i);
	});

	it('says nothing rather than guessing when there is no subscription row', () => {
		expect(renewalDateLabel(null)).toBeNull();
	});

	it('says nothing rather than printing Invalid Date on a broken row', () => {
		expect(renewalDateLabel({ startDate: day('2026-01-05'), endDate: day('nonsense') })).toBeNull();
	});
});

describe('lastUsedLabel', () => {
	// 105 rerun: the approved token row carries "last used 3 days ago", which
	// answers "which of these two is the one I actually use" without arithmetic.
	const now = new Date('2026-09-30T08:00:00.000Z');
	const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

	it('reads a recent use in days', () => {
		expect(lastUsedLabel(daysAgo(3), now)).toBe('last used 3 days ago');
		expect(lastUsedLabel(daysAgo(1), now)).toBe('last used yesterday');
		expect(lastUsedLabel(daysAgo(0), now)).toBe('last used today');
	});

	it('steps up to weeks then months rather than counting to 400 days', () => {
		expect(lastUsedLabel(daysAgo(14), now)).toBe('last used 2 weeks ago');
		expect(lastUsedLabel(daysAgo(90), now)).toBe('last used 3 months ago');
	});

	it('says never used rather than implying it was just now', () => {
		expect(lastUsedLabel(null, now)).toBe('never used');
		expect(lastUsedLabel(undefined, now)).toBe('never used');
	});

	it('says nothing rather than printing Invalid Date on a broken timestamp', () => {
		expect(lastUsedLabel('nonsense', now)).toBeNull();
	});

	it('reads a Date as readily as a string', () => {
		expect(lastUsedLabel(new Date(daysAgo(2)), now)).toBe('last used 2 days ago');
	});
});
