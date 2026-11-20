/**
 * The wire contract: the plan card's response schema and the checkout plan
 * input. The golden body and the legacy `?plan` coercion are the wire, so the
 * S6 handler must parse with exactly these schemas.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { CheckoutPlanInput, PlanLimits, PlanTier, SubscriptionSummary } from './billing.contract';

/** The golden's `FREE_SUMMARY`, as ISO strings (what the wire carries). */
const FREE_SUMMARY = {
	subscription: { tier: null, subscription: null },
	planLimits: {
		familyLimit: 1,
		memberLimit: 6,
		retentionViewDays: 30,
		archivedRetentionDays: 90,
		attachmentLimitBytes: 10485760,
		aiEventCreationsPerMonth: 10,
		exportImportEnabled: true
	},
	aiUsage: { used: 0, limit: 10, remaining: 10 },
	planPricing: { monthly: 9, annual: 90, lifetime: 150, monthlyEquivalent: 7.5 }
};

const TIER_WIRE = {
	id: 'family-master-monthly',
	name: 'Family Master Monthly',
	tierName: 'family_master',
	planType: 'family',
	displayName: 'Family Master',
	createdAt: '2026-01-01T00:00:00.000Z',
	updatedAt: '2026-01-01T00:00:00.000Z',
	durationMonths: 1,
	enabled: true,
	familyLimit: 999,
	memberLimit: 999,
	retentionViewDays: 3650,
	archivedRetentionDays: 3650,
	attachmentLimitBytes: 1073741824,
	aiEventCreationsPerMonth: 999999,
	exportImportEnabled: true
};

describe('SubscriptionSummary', () => {
	it('parses the golden free body exactly', () => {
		expect(SubscriptionSummary.parse(FREE_SUMMARY)).toEqual(FREE_SUMMARY);
	});

	it('parses a paid body with the tier row and the active window', () => {
		const body = {
			...FREE_SUMMARY,
			subscription: {
				tier: TIER_WIRE,
				subscription: {
					id: 'sub-1',
					startDate: '2026-01-05T00:00:00.000Z',
					endDate: '2999-01-01T00:00:00.000Z',
					createdAt: '2026-01-05T00:00:00.000Z'
				}
			}
		};
		expect(SubscriptionSummary.parse(body)).toEqual(body);
	});

	const paid = (tier: unknown, window: unknown) => ({
		...FREE_SUMMARY,
		subscription: { tier, subscription: window }
	});
	const WINDOW_WIRE = {
		id: 'sub-1',
		startDate: '2026-01-05T00:00:00.000Z',
		endDate: '2999-01-01T00:00:00.000Z',
		createdAt: '2026-01-05T00:00:00.000Z'
	};
	const instant = new Date('2026-01-05T00:00:00.000Z');

	it.each<[string, unknown]>([
		['a missing subscription block', { ...FREE_SUMMARY, subscription: undefined }],
		['a missing limits block', { ...FREE_SUMMARY, planLimits: undefined }],
		['a tier date as a Date object', paid({ ...TIER_WIRE, createdAt: instant }, null)],
		['a window date as a Date object', paid(null, { ...WINDOW_WIRE, endDate: instant })],
		['a tier date that is not a date', paid({ ...TIER_WIRE, updatedAt: 'yesterday' }, null)],
		['a string AI counter', { ...FREE_SUMMARY, aiUsage: { used: '1', limit: 10, remaining: 9 } }]
	])('rejects %s', (_label, value) => {
		expect(SubscriptionSummary.safeParse(value).success).toBe(false);
	});
});

describe('PlanTier', () => {
	it('accepts the whole tier row as the wire carries it', () => {
		expect(PlanTier.parse(TIER_WIRE)).toEqual(TIER_WIRE);
	});
});

describe('PlanLimits', () => {
	it('accepts the documented free limits', () => {
		expect(PlanLimits.parse(FREE_SUMMARY.planLimits)).toEqual(FREE_SUMMARY.planLimits);
	});
});

describe('CheckoutPlanInput', () => {
	it.each<[unknown, string]>([
		['monthly', 'monthly'],
		['annual', 'annual'],
		['lifetime', 'lifetime'],
		['yearly', 'monthly'],
		['Annual', 'monthly'],
		['', 'monthly'],
		[42, 'monthly'],
		[null, 'monthly'],
		[undefined, 'monthly']
	])('coerces plan %j to %s, like the legacy checkout page', (plan, expected) => {
		expect(CheckoutPlanInput.parse({ plan }).plan).toBe(expected);
	});

	it('defaults an absent query to monthly', () => {
		expect(CheckoutPlanInput.parse({})).toEqual({ plan: 'monthly' });
	});
});
