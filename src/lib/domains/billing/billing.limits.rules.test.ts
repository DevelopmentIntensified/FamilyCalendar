/**
 * Pure plan-limit rules: the free policy, the override merge and the six
 * refusals. Expected values come from the README Invariants and the legacy
 * service they cite (`subscriptionService.ts`), never from running the code.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import type { PlanLimits, PlanSubscription, PlanTierView } from './billing.contract';
import {
	archiveRefusal,
	attachmentRefusal,
	exportImportRefusal,
	FREE_PLAN_LIMITS,
	familyCreationRefusal,
	isUnlimitedLimit,
	memberLimitRefusal,
	resolvePlanLimits,
	retentionRefusal
} from './billing.limits.rules';

const TIER: PlanTierView = {
	id: 'family-master-monthly',
	name: 'Family Master Monthly',
	tierName: 'family_master',
	planType: 'family',
	displayName: 'Family Master',
	createdAt: new Date('2026-01-01T00:00:00Z'),
	updatedAt: new Date('2026-01-01T00:00:00Z'),
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

const ROW: PlanSubscription = {
	id: 'sub-1',
	startDate: new Date('2026-01-05T00:00:00Z'),
	endDate: new Date('2999-01-01T00:00:00Z'),
	createdAt: new Date('2026-01-05T00:00:00Z'),
	familyLimitOverride: null,
	memberLimitOverride: null,
	retentionViewDaysOverride: null,
	archivedRetentionDaysOverride: null,
	attachmentLimitBytesOverride: null
};

const limitsWith = (overrides: Partial<PlanLimits>): PlanLimits => ({
	...FREE_PLAN_LIMITS,
	...overrides
});

describe('resolvePlanLimits', () => {
	it('free policy literal', () => {
		expect(FREE_PLAN_LIMITS).toEqual({
			familyLimit: 1,
			memberLimit: 6,
			retentionViewDays: 30,
			archivedRetentionDays: 90,
			attachmentLimitBytes: 10485760,
			aiEventCreationsPerMonth: 10,
			exportImportEnabled: true
		});
	});

	it('row overrides win for the five overridable limits', () => {
		const limits = resolvePlanLimits(
			{
				...ROW,
				familyLimitOverride: 2,
				memberLimitOverride: 7,
				retentionViewDaysOverride: 3,
				archivedRetentionDaysOverride: 0,
				attachmentLimitBytesOverride: 5
			},
			{ ...TIER, exportImportEnabled: false }
		);
		expect(limits).toEqual({
			familyLimit: 2,
			memberLimit: 7,
			retentionViewDays: 3,
			archivedRetentionDays: 0,
			attachmentLimitBytes: 5,
			aiEventCreationsPerMonth: 999999,
			exportImportEnabled: false
		});
	});

	it('falls back to the tier value when an override is null', () => {
		expect(resolvePlanLimits(ROW, TIER)).toEqual({
			familyLimit: 999,
			memberLimit: 999,
			retentionViewDays: 3650,
			archivedRetentionDays: 3650,
			attachmentLimitBytes: 1073741824,
			aiEventCreationsPerMonth: 999999,
			exportImportEnabled: true
		});
	});

	it.each<[string, PlanSubscription | null, PlanTierView | null]>([
		['no row', null, TIER],
		['a row without a tier', ROW, null],
		['neither', null, null]
	])('returns the free policy for %s, even with overrides', (_label, row, tier) => {
		const overridden: PlanSubscription | null =
			row === null ? null : { ...row, familyLimitOverride: 5 };
		expect(resolvePlanLimits(overridden, tier)).toEqual(FREE_PLAN_LIMITS);
	});
});

describe('memberLimitRefusal', () => {
	const full = (limit: number) =>
		`Family is full (${limit} member limit). Upgrade to add more members.`;

	// The first five rows are the legacy boundary table
	// (subscriptionService.test.ts:176-196, canAddFamilyMember).
	it.each<[string, number, number, string | null]>([
		['under limit allows add', 4, 5, null],
		['at limit refuses add', 5, 5, full(5)],
		['over limit refuses add', 7, 5, full(5)],
		['empty family under free-tier limit allows add', 0, 1, null],
		['single member at free-tier limit refuses add', 1, 1, full(1)],
		['free default: five of six allows add', 5, 6, null],
		['free default: six of six refuses add', 6, 6, full(6)]
	])('member limit refuses at the limit, allows one below: %s', (_label, count, limit, expected) => {
		expect(memberLimitRefusal(limitsWith({ memberLimit: limit }), count)).toBe(expected);
	});
});

describe('familyCreationRefusal', () => {
	const limits = limitsWith({ familyLimit: 1 });

	it.each<[number, string | null]>([
		[0, null],
		[1, 'Family limit reached (1). Upgrade to create more families.'],
		[4, 'Family limit reached (1). Upgrade to create more families.']
	])('family creation refuses at the family limit: %i used → %j', (familiesUsed, expected) => {
		expect(familyCreationRefusal(limits, familiesUsed)).toBe(expected);
	});

	it('allows the first family on the free plan (subscriptionService.test.ts:117-121)', () => {
		expect(familyCreationRefusal(FREE_PLAN_LIMITS, 0)).toBeNull();
	});
});

describe('retentionRefusal', () => {
	const refused = 'Event is older than your retention limit. Upgrade to view archived events.';
	// 2026-03-31 minus the free plan's 30 days is the 2026-03-01 cut.
	const now = new Date('2026-03-31T12:00:00Z');
	const limits = limitsWith({ retentionViewDays: 30 });

	// The 10/45/60-day rows are the legacy cases
	// (subscriptionService.test.ts:147-168, canViewArchivedEvent).
	it.each<[string, string, string | null]>([
		['one second before the cutoff', '2026-03-01T11:59:59Z', refused],
		['exactly on the cutoff', '2026-03-01T12:00:00Z', null],
		['inside the window', '2026-03-10T12:00:00Z', null],
		['ten days old', '2026-03-21T12:00:00Z', null],
		['forty-five days old', '2026-02-14T12:00:00Z', refused],
		['sixty days old', '2026-01-30T12:00:00Z', refused]
	])('retention refuses an event older than the window: %s', (_label, eventDate, expected) => {
		expect(retentionRefusal(limits, new Date(eventDate), now)).toBe(expected);
	});
});

describe('archiveRefusal', () => {
	it.each<[number, string | null]>([
		[90, null],
		[3650, null],
		[0, 'Archive view not available on your plan'],
		[-1, 'Archive view not available on your plan']
	])('archive needs a plan with archived days: %i days → %j', (archivedRetentionDays, expected) => {
		expect(archiveRefusal(limitsWith({ archivedRetentionDays }))).toBe(expected);
	});
});

describe('attachmentRefusal', () => {
	const MIB = 1024 * 1024;

	it('allows an upload exactly at the byte limit', () => {
		expect(attachmentRefusal(limitsWith({ attachmentLimitBytes: 10 * MIB }), 10 * MIB)).toBeNull();
	});

	it('allows a 5 MiB file on the free plan (subscriptionService.test.ts:241-245)', () => {
		expect(attachmentRefusal(FREE_PLAN_LIMITS, 5 * MIB)).toBeNull();
	});

	it('refuses a 15 MiB file on the free plan (subscriptionService.test.ts:247-257)', () => {
		expect(attachmentRefusal(FREE_PLAN_LIMITS, 15 * MIB)).toBe(
			'File too large. Max 10MB on your plan.'
		);
	});

	it('attachment refusal prints the rounded MiB limit for one byte over', () => {
		expect(attachmentRefusal(limitsWith({ attachmentLimitBytes: 10 * MIB }), 10 * MIB + 1)).toBe(
			'File too large. Max 10MB on your plan.'
		);
	});

	it('rounds the printed limit to whole MiB', () => {
		// 1.5 MiB rounds to 2MB, exactly like the legacy Math.round.
		expect(attachmentRefusal(limitsWith({ attachmentLimitBytes: 1.5 * MIB }), 1.5 * MIB + 1)).toBe(
			'File too large. Max 2MB on your plan.'
		);
	});
});

describe('exportImportRefusal', () => {
	it.each<[boolean, string | null]>([
		[true, null],
		[false, 'Export/Import not available on your plan. Upgrade to access.']
	])('export/import follows the tier flag: %s → %j', (exportImportEnabled, expected) => {
		expect(exportImportRefusal(limitsWith({ exportImportEnabled }))).toBe(expected);
	});
});

describe('isUnlimitedLimit', () => {
	it.each<[number, boolean]>([
		[0, false],
		[6, false],
		[998, false],
		[999, true],
		[1000, true],
		[999999, true]
	])('999 and up reads Unlimited: %i → %s', (limit, expected) => {
		expect(isUnlimitedLimit(limit)).toBe(expected);
	});
});
