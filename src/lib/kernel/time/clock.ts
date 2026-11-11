/**
 * Clock port. Every "now" in domain code comes from `ctx.clock.now()`, never
 * from `Date.now()` / `new Date()` / `DateTime.now()` (arch rule R5), so tests
 * pin time with `fixedClock` and recurrence/cursor/date-rollover rules stay
 * deterministic.
 *
 * Doc: src/lib/kernel/README.md#time
 */
export type Clock = {
	/** Current instant. */
	now(): Date;
};

export const systemClock: Clock = {
	now: () => new Date()
};

/** A test clock that only moves when told to. */
export type FixedClock = Clock & {
	set(iso: string): void;
	advanceMs(ms: number): void;
};

export const DEFAULT_TEST_NOW = '2026-01-15T12:00:00.000Z';

export function fixedClock(iso: string = DEFAULT_TEST_NOW): FixedClock {
	let current = parseInstant(iso);
	return {
		now: () => new Date(current),
		set(next: string) {
			current = parseInstant(next);
		},
		advanceMs(ms: number) {
			current += ms;
		}
	};
}

function parseInstant(iso: string): number {
	const ms = Date.parse(iso);
	if (Number.isNaN(ms)) throw new Error(`fixedClock: not an ISO instant: ${iso}`);
	return ms;
}
