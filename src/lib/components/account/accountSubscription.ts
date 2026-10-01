/** Pure subscription display helpers for the account page (#039). */

export function formatBytesLabel(bytes: number | null | undefined): string {
	if (!bytes) return '—';
	if (bytes >= 1048576) return `${Math.round(bytes / 1048576)}MB`;
	return `${Math.round(bytes / 1024)}KB`;
}

export interface SubTier {
	durationMonths?: number | null;
	displayName?: string | null;
	tierName?: string | null;
}

export interface SubRow {
	startDate: Date | string;
	endDate: Date | string;
}

export function subscriptionPeriodLabel(
	isPaidPlan: boolean,
	sub: { tier: SubTier | null; row: SubRow | null } | null
): string {
	if (!isPaidPlan) return 'No subscription yet';
	if (!sub?.row) return 'Active';
	const fmt = (d: Date) =>
		d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
	const durationMonths = sub.tier?.durationMonths ?? 0;
	if (durationMonths >= 100)
		return `Lifetime access · active since ${fmt(new Date(sub.row.startDate))}`;
	return `Started ${fmt(new Date(sub.row.startDate))} · renews ${fmt(new Date(sub.row.endDate))}`;
}

/**
 * 105: the usage line the approved page shows — "N of M" against the plan's
 * real limit, not a bare plan name.
 *
 * `999` is the codebase's stand-in for "no limit", so a usage count is only
 * worth rendering when the limit is a real number; otherwise the row says
 * `Unlimited`, which is the truth, rather than "3 of 999".
 */
export function usageLine(used: number, limit: number | null | undefined): string {
	if (!limit || limit >= 999) return 'Unlimited';
	return `${used} of ${limit}`;
}
