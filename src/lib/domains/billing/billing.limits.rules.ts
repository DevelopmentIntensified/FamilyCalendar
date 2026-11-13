/**
 * billing plan-limit rules: the free policy literal, the merge of a
 * subscription row's overrides over its tier, and the six refusals a caller
 * raises before an action. Pure: "now" is a parameter and the row counts
 * (family members, families used, an event's date, attachment bytes) arrive
 * from the module that owns those tables — billing owns only the plan tables.
 *
 * Each refusal returns its user-facing message, or null when the action is
 * allowed, so no caller can invent a second wording.
 *
 * Doc: ./README.md#invariants
 */
import type { PlanLimits, PlanSubscription, PlanTierView } from './billing.contract';

/**
 * The free policy in one literal: 1 family, 6 members, 30 retention-view days,
 * 90 archived days, 10 MiB attachments, 10 AI creations a month, export/import
 * on. An account with no active subscription row gets exactly this.
 */
export const FREE_PLAN_LIMITS: PlanLimits = {
	familyLimit: 1,
	memberLimit: 6,
	retentionViewDays: 30,
	archivedRetentionDays: 90,
	attachmentLimitBytes: 10485760,
	aiEventCreationsPerMonth: 10,
	exportImportEnabled: true
};

/**
 * The one merge rule: the row's override beats the tier for the five
 * per-subscription limits (`??`, so an override of 0 still wins); the AI count
 * and the export/import flag always come from the tier. A row without a tier,
 * or no row at all, is the free policy — the legacy code returned its defaults
 * there and never applied overrides.
 */
export function resolvePlanLimits(
	row: PlanSubscription | null,
	tier: PlanTierView | null
): PlanLimits {
	if (!row || !tier) return { ...FREE_PLAN_LIMITS };
	return {
		familyLimit: row.familyLimitOverride ?? tier.familyLimit,
		memberLimit: row.memberLimitOverride ?? tier.memberLimit,
		retentionViewDays: row.retentionViewDaysOverride ?? tier.retentionViewDays,
		archivedRetentionDays: row.archivedRetentionDaysOverride ?? tier.archivedRetentionDays,
		attachmentLimitBytes: row.attachmentLimitBytesOverride ?? tier.attachmentLimitBytes,
		aiEventCreationsPerMonth: tier.aiEventCreationsPerMonth,
		exportImportEnabled: tier.exportImportEnabled
	};
}

/**
 * At or over the member limit refuses (the legacy `currentCount >= limit`).
 * The member limit is the family creator's, resolved by the caller.
 */
export function memberLimitRefusal(limits: PlanLimits, memberCount: number): string | null {
	if (memberCount < limits.memberLimit) return null;
	return `Family is full (${limits.memberLimit} member limit). Upgrade to add more members.`;
}

/** At or over the family limit refuses; the caller supplies the distinct count. */
export function familyCreationRefusal(limits: PlanLimits, familiesUsed: number): string | null {
	if (familiesUsed < limits.familyLimit) return null;
	return `Family limit reached (${limits.familyLimit}). Upgrade to create more families.`;
}

/**
 * An event older than the retention window refuses; an event exactly on the
 * cutoff is still visible (the legacy strict `<`).
 */
export function retentionRefusal(limits: PlanLimits, eventDate: Date, now: Date): string | null {
	const cutoff = new Date(now.getTime() - limits.retentionViewDays * 86_400_000);
	if (eventDate >= cutoff) return null;
	return 'Event is older than your retention limit. Upgrade to view archived events.';
}

/** Archive access is a tier capability: no archived days means no archive. */
export function archiveRefusal(limits: PlanLimits): string | null {
	if (limits.archivedRetentionDays > 0) return null;
	return 'Archive view not available on your plan';
}

/**
 * Over the byte limit refuses, printing the limit in whole MiB (the legacy
 * `Math.round(bytes / 1048576)`), never in bytes.
 */
export function attachmentRefusal(limits: PlanLimits, fileSizeBytes: number): string | null {
	if (fileSizeBytes <= limits.attachmentLimitBytes) return null;
	const maxMegabytes = Math.round(limits.attachmentLimitBytes / 1048576);
	return `File too large. Max ${maxMegabytes}MB on your plan.`;
}

/** The tier flag decides export/import, never a row override. */
export function exportImportRefusal(limits: PlanLimits): string | null {
	if (limits.exportImportEnabled) return null;
	return 'Export/Import not available on your plan. Upgrade to access.';
}

/**
 * `999` and up is the seed's "no limit" stand-in: a display reads it as
 * `Unlimited` rather than inventing a ceiling. (A null or 0 limit is a separate
 * display decision, made where the row is rendered.)
 */
export function isUnlimitedLimit(limit: number): boolean {
	return limit >= 999;
}
