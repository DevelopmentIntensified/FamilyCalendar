/**
 * `ShellOfflineState` in node: the banner is up for any of three reasons, the
 * offline paragraph's own flag stays false while merely pending, the reconnect
 * read (after its 2 s head start), and the 4 s "Synced N changes." receipt.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { manualScheduler } from '$lib/kernel/testing/manualScheduler';
import type { ShellOfflinePort } from './shell.contract';
import { ShellOfflineState } from './shell.offline.state.svelte.js';

type FakePort = ShellOfflinePort & { setOnline(online: boolean): void };

/** Answers the counts in order, then keeps the last one. */
function portOf(counts: number[], startOnline = true): FakePort {
	let listener: ((online: boolean) => void) | null = null;
	let index = 0;
	return {
		setOnline(online) {
			listener?.(online);
		},
		isOnline: () => startOnline,
		pendingCount: async () => counts[Math.min(index++, counts.length - 1)],
		subscribe(next) {
			listener = next;
			next(startOnline);
			return () => {
				listener = null;
			};
		}
	};
}

describe('ShellOfflineState', () => {
	it('keeps the banner up without claiming offline, then shows the 4 s receipt', async () => {
		const scheduler = manualScheduler();
		const port = portOf([2, 0]);
		const state = new ShellOfflineState(port, { schedule: scheduler.schedule });

		await state.start();
		expect(state.online).toBe(true);
		expect(state.pending).toBe(2);
		expect(state.visible).toBe(true);
		expect(scheduler.tasks.map((task) => task.ms)).toEqual([2000]);

		// Reconnect: the read waits for the replay, then announces the sync.
		port.setOnline(true);
		expect(scheduler.tasks.at(-1)?.ms).toBe(2000);
		await state.reconnect();
		expect(state.pending).toBe(0);
		expect(state.synced).toBe(2);
		expect(state.visible).toBe(true);
		expect(scheduler.tasks.at(-1)?.ms).toBe(4000);

		scheduler.fireAll();
		expect(state.synced).toBeNull();
		expect(state.visible).toBe(false);
		state.stop();
	});

	it('drops the receipt when the connection goes away and never claims offline for a pending count', async () => {
		const scheduler = manualScheduler();
		const port = portOf([1]);
		const state = new ShellOfflineState(port, { schedule: scheduler.schedule });
		await state.start();
		expect(state.online).toBe(true);
		expect(state.visible).toBe(true);

		port.setOnline(false);
		expect(state.online).toBe(false);
		expect(state.visible).toBe(true);
		state.stop();
	});
});
