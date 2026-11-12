import { describe, expect, it } from 'vitest';
import { createToasts, memoryToasts, type Scheduler } from './toasts.svelte.js';

/** A scheduler the test fires by hand; nothing depends on real timers. */
function manualScheduler(): {
	schedule: Scheduler;
	tasks: { fn: () => void; ms: number; cancelled: boolean }[];
	fireAll: () => void;
} {
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

describe('createToasts', () => {
	it('adds success, error and info toasts with increasing ids', () => {
		const toasts = createToasts({ schedule: manualScheduler().schedule });

		toasts.success('Saved');
		toasts.error('Could not save');
		toasts.info('Heads up');

		expect(toasts.items).toEqual([
			{ id: 1, kind: 'success', text: 'Saved' },
			{ id: 2, kind: 'error', text: 'Could not save' },
			{ id: 3, kind: 'info', text: 'Heads up' }
		]);
	});

	it('keeps at most four visible, dropping the oldest', () => {
		const toasts = createToasts({ schedule: manualScheduler().schedule });

		for (const text of ['one', 'two', 'three', 'four', 'five']) toasts.info(text);

		expect(toasts.items.map((toast) => toast.text)).toEqual(['two', 'three', 'four', 'five']);
		expect(toasts.items.map((toast) => toast.id)).toEqual([2, 3, 4, 5]);
	});

	it('dismisses every toast after six seconds', () => {
		const scheduler = manualScheduler();
		const toasts = createToasts({ schedule: scheduler.schedule });

		toasts.success('Saved');

		expect(scheduler.tasks).toHaveLength(1);
		expect(scheduler.tasks[0].ms).toBe(6000);
		scheduler.fireAll();
		expect(toasts.items).toEqual([]);
	});

	it('still schedules a dismissal for a toast that was dropped', () => {
		const scheduler = manualScheduler();
		const toasts = createToasts({ schedule: scheduler.schedule });

		for (const text of ['one', 'two', 'three', 'four', 'five']) toasts.info(text);

		expect(scheduler.tasks).toHaveLength(5);
		expect(scheduler.tasks.every((task) => task.ms === 6000)).toBe(true);

		scheduler.fireAll();
		expect(toasts.items).toEqual([]);
	});

	it('dismiss removes only the given toast', () => {
		const toasts = createToasts({ schedule: manualScheduler().schedule });

		toasts.info('one');
		toasts.info('two');

		toasts.dismiss(1);

		expect(toasts.items).toEqual([{ id: 2, kind: 'info', text: 'two' }]);
	});
});

describe('memoryToasts', () => {
	it('records what a state class reported, in order', () => {
		const toasts = memoryToasts();

		toasts.success('Task completed');
		toasts.error('Not yours');
		toasts.info('Saved offline');

		expect(toasts.items).toEqual([
			{ kind: 'success', text: 'Task completed' },
			{ kind: 'error', text: 'Not yours' },
			{ kind: 'info', text: 'Saved offline' }
		]);
	});
});
