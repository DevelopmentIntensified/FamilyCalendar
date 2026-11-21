/**
 * The Plan & usage card's strings and the token row's relative label, copied
 * from legacy `accountSubscription.ts` (#039) case by case. `now` is passed in
 * (rule R5); locale-formatted sentences are asserted structurally so the table
 * does not depend on the runner's locale.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import {
	accountAiCreationsLabel,
	accountAiResetLabel,
	accountAiUsagePercent,
	accountArchiveLabel,
	accountFormatBytes,
	accountLastUsedLabel,
	accountRenewalDateLabel,
	accountRetentionLabel,
	accountSubscriptionPeriodLabel,
	accountUsageLine
} from './account.subscription.rules';

const NOW = new Date('2027-03-20T12:00:00.000Z');

describe('accountFormatBytes', () => {
	it.each<[string, number | null | undefined, string]>([
		['no limit', 0, '—'],
		['nothing', null, '—'],
		['kilobytes', 524288, '512KB'],
		['megabytes', 5 * 1048576, '5MB']
	])('renders %s', (_label, bytes, expected) => {
		expect(accountFormatBytes(bytes)).toBe(expected);
	});
});

describe('accountUsageLine', () => {
	it.each<[string, number, number | null | undefined, string]>([
		['a real limit', 3, 5, '3 of 5'],
		['the 999 no-limit stand-in', 3, 999, 'Unlimited'],
		['a missing limit', 3, null, 'Unlimited'],
		['a zero limit', 0, 0, 'Unlimited']
	])('renders %s', (_label, used, limit, expected) => {
		expect(accountUsageLine(used, limit)).toBe(expected);
	});
});

describe('accountRetentionLabel', () => {
	it.each<[string, number | null | undefined, string]>([
		['ten years reads full history', 3650, 'Full history'],
		['a real number of days', 30, '30 days'],
		['the approved fallback', null, '30 days']
	])('renders %s', (_label, days, expected) => {
		expect(accountRetentionLabel(days)).toBe(expected);
	});
});

describe('accountArchiveLabel', () => {
	it.each<[string, number | null | undefined, string]>([
		['zero days means not included', 0, 'Not included'],
		['ten years reads full archive', 3650, 'Full archive'],
		['a real number of days', 90, '90 days'],
		['the approved fallback', null, '90 days']
	])('renders %s', (_label, days, expected) => {
		expect(accountArchiveLabel(days)).toBe(expected);
	});
});

describe('accountAiCreationsLabel', () => {
	it('reads Unlimited at the six-digit no-limit stand-in', () => {
		expect(accountAiCreationsLabel(3, 999999)).toBe('Unlimited');
	});

	it('reads used / limit this month otherwise', () => {
		expect(accountAiCreationsLabel(3, 20)).toBe('3 / 20 this month');
	});
});

describe('accountAiUsagePercent', () => {
	it.each<[string, number, number, number]>([
		['a real fraction', 3, 20, 15],
		['a clamped over-limit count', 40, 20, 100],
		['no real limit', 3, 999, 0],
		['no limit at all', 0, 0, 0]
	])('renders %s', (_label, used, limit, expected) => {
		expect(accountAiUsagePercent(used, limit)).toBe(expected);
	});
});

describe('accountSubscriptionPeriodLabel', () => {
	it('says No subscription yet on the free plan', () => {
		expect(accountSubscriptionPeriodLabel(false, null)).toBe('No subscription yet');
	});

	it('says Active for a paid plan with no window row', () => {
		expect(accountSubscriptionPeriodLabel(true, { tier: null, row: null })).toBe('Active');
	});

	it('names a lifetime plan as active since its start', () => {
		const label = accountSubscriptionPeriodLabel(true, {
			tier: { durationMonths: 120 } as never,
			row: { startDate: '2026-01-05T00:00:00.000Z', endDate: '2036-01-05T00:00:00.000Z' }
		});
		expect(label).toContain('Lifetime access · active since ');
	});

	it('names the start and the renewal for a monthly plan', () => {
		const label = accountSubscriptionPeriodLabel(true, {
			tier: { durationMonths: 1 } as never,
			row: { startDate: '2026-01-05T00:00:00.000Z', endDate: '2026-02-05T00:00:00.000Z' }
		});
		expect(label).toContain('Started ');
		expect(label).toContain(' · renews ');
	});
});

describe('accountRenewalDateLabel', () => {
	it('is absent without a row', () => {
		expect(accountRenewalDateLabel(null)).toBeNull();
	});

	it('never promises a charge on a lifetime tier', () => {
		expect(
			accountRenewalDateLabel(
				{ startDate: '2026-01-05T00:00:00.000Z', endDate: '2036-01-05T00:00:00.000Z' },
				120
			)
		).toBe('One payment · never renews');
	});

	it('is absent for an unparseable date rather than reading Invalid Date', () => {
		expect(
			accountRenewalDateLabel({ startDate: 'x', endDate: 'not-a-date' }, 1)
		).toBeNull();
	});

	it('prefixes a real end date with Renews', () => {
		const label = accountRenewalDateLabel(
			{ startDate: '2026-01-05T00:00:00.000Z', endDate: '2027-03-12T00:00:00.000Z' },
			1
		);
		expect(label).toMatch(/^Renews /);
	});
});

describe('accountLastUsedLabel', () => {
	it.each<[string, string | null, string | null]>([
		['never used', null, 'never used'],
		['today', '2027-03-20T02:00:00.000Z', 'last used today'],
		['yesterday', '2027-03-19T12:00:00.000Z', 'last used yesterday'],
		['days ago', '2027-03-17T12:00:00.000Z', 'last used 3 days ago'],
		['weeks ago', '2027-03-06T12:00:00.000Z', 'last used 2 weeks ago'],
		['months ago', '2027-01-15T12:00:00.000Z', 'last used 2 months ago'],
		['an unparseable value has no label', 'not-a-date', null]
	])('reads %s', (_label, value, expected) => {
		expect(accountLastUsedLabel(value, NOW)).toBe(expected);
	});
});

describe('accountAiResetLabel', () => {
	it('names the first of next month through the injected formatter', () => {
		const format = (date: Date) => date.toISOString().slice(0, 10);
		expect(accountAiResetLabel(new Date('2026-11-21T00:00:00.000Z'), format)).toBe(
			'Resets 2026-12-01'
		);
	});
});
