/**
 * The one scheduler port for client timers: toasts, debounced search and the
 * ticker. Real code uses `systemScheduler`; tests pass `manualScheduler`
 * (kernel/testing) and fire the callbacks themselves, so no test depends on
 * real timers.
 *
 * Doc: src/lib/kernel/README.md#time
 */

/** Runs `fn` after `ms`; the returned function cancels it. */
export type Scheduler = (fn: () => void, ms: number) => () => void;

export const systemScheduler: Scheduler = (fn, ms) => {
	const handle = setTimeout(fn, ms);
	return () => clearTimeout(handle);
};
