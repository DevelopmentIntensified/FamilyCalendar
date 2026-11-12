/**
 * Test scheduler: records the callbacks instead of running them, so a unit test
 * decides when a debounce or a toast dismissal fires. Kernel unit tests share
 * this instead of re-implementing it per file (task K-07).
 *
 * Doc: src/lib/kernel/README.md#testing
 */
import type { Scheduler } from '../time/scheduler';

export interface ManualScheduler {
	schedule: Scheduler;
	tasks: { fn: () => void; ms: number; cancelled: boolean }[];
	/** Runs every task registered so far; cancelled tasks are skipped. */
	fireAll(): void;
}

export function manualScheduler(): ManualScheduler {
	const tasks: { fn: () => void; ms: number; cancelled: boolean }[] = [];
	const schedule: Scheduler = (fn, ms) => {
		const task = { fn, ms, cancelled: false };
		tasks.push(task);
		return () => {
			task.cancelled = true;
		};
	};
	const fireAll = () => {
		for (const task of tasks.splice(0)) {
			if (!task.cancelled) task.fn();
		}
	};
	return { schedule, tasks, fireAll };
}
