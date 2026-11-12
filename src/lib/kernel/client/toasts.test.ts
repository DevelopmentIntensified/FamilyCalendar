import { describe, expect, it } from 'vitest';
import { manualScheduler } from '$lib/kernel/testing/manualScheduler';
import { createToasts, memoryToasts } from './toasts.svelte.js';

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

	it('keeps the action a caller attached and still dismisses on time', () => {
		const scheduler = manualScheduler();
		const toasts = createToasts({ schedule: scheduler.schedule });
		const action = { label: 'Undo', run: () => {} };

		toasts.success('Task completed', action);

		expect(toasts.items).toEqual([
			{ id: 1, kind: 'success', text: 'Task completed', action }
		]);
		expect(toasts.items[0].action).toBe(action);
		expect(scheduler.tasks[0].ms).toBe(6000);

		scheduler.fireAll();
		expect(toasts.items).toEqual([]);
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

	it('accepts an action without changing the recorded shape', () => {
		const toasts = memoryToasts();

		toasts.success('Task completed', { label: 'Undo', run: () => {} });

		expect(toasts.items).toEqual([{ kind: 'success', text: 'Task completed' }]);
	});
});
