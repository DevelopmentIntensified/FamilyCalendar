import { describe, it, expect } from 'vitest';
import { formatBytesLabel, subscriptionPeriodLabel } from './accountSubscription';

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
