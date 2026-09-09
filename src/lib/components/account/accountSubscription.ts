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
