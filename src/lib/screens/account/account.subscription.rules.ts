/**
 * The Plan & usage section's pure part: the period and renewal lines, the
 * usage lines, the retention cells, the AI-usage bar's percentage and the
 * token row's relative "last used".
 *
 * Legacy `components/account/accountSubscription.ts` (#039) is the source of
 * every string here; it is copied row by row because the copy is the approved
 * page's. `now` is always a parameter (rule R5), so no rule reads the clock.
 *
 * These belong in `billing`'s rules (the sheet's file plan says so) but billing
 * does not export them yet; until it does they live with the screen that
 * renders them (report ASK).
 *
 * Doc: ./README.md#invariants
 */
import type { AccountSectionModel } from './account.contract';

/** The subscription slice the plan card renders. */
export type AccountSubscriptionSectionModel = Extract<
	AccountSectionModel,
	{ section: 'subscription' }
>;

/** One `subscriptionTypes` row as the card reads it (dates already ISO strings). */
export type AccountSubTier = AccountSubscriptionSectionModel['subscription']['tier'];

/** The active window row as the card reads it. */
export type AccountSubRow = NonNullable<AccountSubscriptionSectionModel['subscription']['subscription']>;

/** `5MB` / `512KB`; a missing or zero limit reads as an em dash. */
export function accountFormatBytes(bytes: number | null | undefined): string {
	if (!bytes) return '—';
	if (bytes >= 1048576) return `${Math.round(bytes / 1048576)}MB`;
	return `${Math.round(bytes / 1024)}KB`;
}

/** The period sentence the approved card puts beside "Active". */
export function accountSubscriptionPeriodLabel(
	isPaidPlan: boolean,
	sub: { readonly tier: AccountSubTier | null; readonly row: AccountSubRow | null } | null
): string {
	if (!isPaidPlan) return 'No subscription yet';
	if (!sub?.row) return 'Active';
	const format = (value: string) =>
		new Date(value).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	const durationMonths = sub.tier?.durationMonths ?? 0;
	if (durationMonths >= 100) return `Lifetime access · active since ${format(sub.row.startDate)}`;
	return `Started ${format(sub.row.startDate)} · renews ${format(sub.row.endDate)}`;
}

/**
 * "N of M" against the plan's real limit. `999` is the codebase's "no limit"
 * stand-in, so a count against it would be a count against a number nobody can
 * reach — the row says `Unlimited` instead.
 */
export function accountUsageLine(used: number, limit: number | null | undefined): string {
	if (!limit || limit >= 999) return 'Unlimited';
	return `${used} of ${limit}`;
}

/**
 * The renewal line on its own (`Renews 12 Mar 2027`), because it is the one
 * date a reader actually wants. A lifetime tier never renews; a missing or
 * unparseable date yields null, so the line is absent rather than wrong.
 */
export function accountRenewalDateLabel(
	row: AccountSubRow | null | undefined,
	durationMonths: number | null | undefined = null
): string | null {
	if (!row) return null;
	if ((durationMonths ?? 0) >= 100) return 'One payment · never renews';
	const end = new Date(row.endDate);
	if (Number.isNaN(end.getTime())) return null;
	return `Renews ${end.toLocaleDateString(undefined, {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	})}`;
}

/**
 * "last used 3 days ago" — the approved token row's one-line provenance. Never
 * used is its own state, not "just now"; an unparseable value has no label.
 */
export function accountLastUsedLabel(
	value: string | Date | null | undefined,
	now: Date
): string | null {
	if (!value) return 'never used';
	const when = new Date(value);
	if (Number.isNaN(when.getTime())) return null;
	const days = Math.floor((now.getTime() - when.getTime()) / 86_400_000);
	if (days <= 0) return 'last used today';
	if (days === 1) return 'last used yesterday';
	if (days < 14) return `last used ${days} days ago`;
	if (days < 60) return `last used ${Math.floor(days / 7)} weeks ago`;
	return `last used ${Math.floor(days / 30)} months ago`;
}

/** "30 days" / "Full history" — the event-history cell. */
export function accountRetentionLabel(days: number | null | undefined): string {
	if ((days ?? 0) >= 3650) return 'Full history';
	return `${days ?? 30} days`;
}

/** "Not included" / "Full archive" / "90 days" — the archived-events cell. */
export function accountArchiveLabel(days: number | null | undefined): string {
	if (days === 0) return 'Not included';
	if ((days ?? 0) >= 3650) return 'Full archive';
	return `${days ?? 90} days`;
}

/** "Unlimited" / "3 / 20 this month" — the AI-creation limits cell. */
export function accountAiCreationsLabel(used: number, limit: number): string {
	if (limit >= 999999) return 'Unlimited';
	return `${used} / ${limit} this month`;
}

/** The bar's fill, clamped to 100; 0 when there is no real limit to draw against. */
export function accountAiUsagePercent(used: number, limit: number): number {
	if (!(limit > 0) || limit >= 999) return 0;
	return Math.min(100, Math.round((used / limit) * 100));
}

/** "Resets 1 October" — the first of next month, in the reader's own words. */
export function accountAiResetLabel(
	now: Date,
	format: (date: Date) => string = accountAiResetDateFormat
): string {
	const next = new Date(now.getTime());
	next.setMonth(next.getMonth() + 1, 1);
	return `Resets ${format(next)}`;
}

/** The approved reset-date format; exported so tests pin it without a locale. */
export function accountAiResetDateFormat(date: Date): string {
	return date.toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
}
