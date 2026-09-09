/** Shared task display helpers (#039): one copy instead of one per component. */

const FREQ_NOUN = {
	daily: 'day',
	weekly: 'week',
	monthly: 'month',
	yearly: 'year'
} satisfies Record<string, string>;

export function freqNoun(frequency: string | null | undefined): string | undefined {
	if (
		frequency === 'daily' ||
		frequency === 'weekly' ||
		frequency === 'monthly' ||
		frequency === 'yearly'
	)
		return FREQ_NOUN[frequency];
	return undefined;
}

export function formatDue(due: string | null): string {
	if (!due) return '';
	const dt = new Date(due);
	if (isNaN(dt.getTime())) return '';
	// Long (multi-year) recurring tasks need the year; same-year dates stay short.
	const opts: Intl.DateTimeFormatOptions =
		dt.getFullYear() !== new Date().getFullYear()
			? { month: 'short', day: 'numeric', year: 'numeric' }
			: { month: 'short', day: 'numeric' };
	return dt.toLocaleDateString(undefined, opts);
}
