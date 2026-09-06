/** Clamps a raw body count into [min, max], falling back on absent/non-numeric input. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- boundary parser: request-body numbers arrive unvalidated; junk falls back rather than throwing.
export function clampCount(value: unknown, min: number, max: number, fallback: number): number {
	if (value === null || value === undefined || value === '') return fallback;
	const n = typeof value === 'number' ? value : Number(value);
	if (!Number.isFinite(n)) return fallback;
	return Math.min(max, Math.max(min, Math.trunc(n)));
}
