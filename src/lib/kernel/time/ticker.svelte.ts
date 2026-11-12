/**
 * Reactive "now" for countdowns and elapsed-time bands: rebuilds `now` from the
 * clock on every interval, so a component re-renders without its own
 * `setInterval` (folds the TaskRow / TaskLoggedTimeBand copies, task K-07).
 *
 * Doc: src/lib/kernel/README.md#client
 */
import { systemScheduler, type Scheduler } from './scheduler';
import type { Clock } from './clock';

/** Placeholder until the constructor reads the clock; never rendered. */
const EPOCH = new Date(0);

export class Ticker {
	now = $state<Date>(EPOCH);

	private readonly clock: Clock;
	private readonly everyMs: number;
	private readonly schedule: Scheduler;
	private running = false;
	private cancel: (() => void) | null = null;

	constructor(clock: Clock, everyMs: number, schedule: Scheduler = systemScheduler) {
		this.clock = clock;
		this.everyMs = everyMs;
		this.schedule = schedule;
		this.now = clock.now();
	}

	start(): void {
		if (this.running) return;
		this.running = true;
		this.scheduleNext();
	}

	stop(): void {
		this.running = false;
		this.cancel?.();
		this.cancel = null;
	}

	private scheduleNext(): void {
		if (!this.running) return;
		this.cancel = this.schedule(() => {
			this.cancel = null;
			if (!this.running) return;
			this.now = this.clock.now();
			this.scheduleNext();
		}, this.everyMs);
	}
}
