/**
 * The recurring / one-off split (issue 203) — one definition, two surfaces.
 *
 * The tasks page lists recurring and non-recurring work apart, and the
 * dashboard's Top-list module drops each of its rows into the same two
 * buckets. Both read THIS seam, so the two surfaces can never disagree about
 * what "recurring" means.
 *
 * The definition is the tasks table's own: a Recurring Task is a row where
 * `recurrenceFrequency` is not null (the server's IS NOT NULL seat, e.g.
 * dashboard.ts:208). Rows carry that column as `string | null | undefined`
 * depending on how far they travelled; absent means one-off.
 *
 * Pure + order-preserving: one pass, each row lands in exactly one bucket, so
 * counts can never double-book a row.
 */
export interface RecurrenceSplitable {
	recurrenceFrequency?: string | null;
}

export function isRecurringTask(task: RecurrenceSplitable): boolean {
	return task.recurrenceFrequency != null;
}

export function splitByRecurrence<T extends RecurrenceSplitable>(
	rows: readonly T[]
): { recurring: T[]; oneOff: T[] } {
	const recurring: T[] = [];
	const oneOff: T[] = [];
	for (const row of rows) {
		(isRecurringTask(row) ? recurring : oneOff).push(row);
	}
	return { recurring, oneOff };
}
