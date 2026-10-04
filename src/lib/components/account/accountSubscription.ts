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

/**
 * The "Renews 12 March 2027" line the approved plan card carries.
 *
 * 105 rerun: the date used to live inside `subscriptionPeriodLabel`'s one
 * sentence ("Started 5 Jan 2026 · renews 12 Mar 2027"), which put the one date
 * a reader actually wants — when they are next charged — behind a second fact
 * they did not ask for. This is that date on its own line.
 *
 * A lifetime tier (`durationMonths >= 100`) has an endDate like any other row,
 * so it says it never renews rather than promising a charge that is not
 * coming. No row, or an unparseable date, yields null: the line is then simply
 * absent rather than reading "Renews Invalid Date".
 */
export function renewalDateLabel(
	row: SubRow | null | undefined,
	durationMonths: number | null | undefined = null
): string | null {
	if (!row) return null;
	const fmt = (d: Date) =>
		d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
	if ((durationMonths ?? 0) >= 100) return 'One payment · never renews';
	const end = new Date(row.endDate);
	if (isNaN(end.getTime())) return null;
	return `Renews ${fmt(end)}`;
}

/**
 * "last used 3 days ago" — the approved token row's one-line provenance.
 *
 * Relative, because a reader comparing two tokens wants to know which one they
 * have actually been using, and an absolute timestamp makes them do the
 * subtraction. Never used is its own state, not "just now".
 *
 * The approved row also shows a masked token (`fp_live_••••••••7a2c`). That is
 * NOT built: `api_tokens` stores only `token_hash`, with no last-four column,
 * so those four characters do not exist to show. Printing bullets anyway would
 * be a badge of invented characters. It needs a `token_hint` column.
 */
export function lastUsedLabel(value: string | Date | null | undefined, now: Date): string | null {
	if (!value) return 'never used';
	const when = new Date(value);
	if (isNaN(when.getTime())) return null;
	const days = Math.floor((now.getTime() - when.getTime()) / 86_400_000);
	if (days <= 0) return 'last used today';
	if (days === 1) return 'last used yesterday';
	if (days < 14) return `last used ${days} days ago`;
	if (days < 60) return `last used ${Math.floor(days / 7)} weeks ago`;
	return `last used ${Math.floor(days / 30)} months ago`;
}
