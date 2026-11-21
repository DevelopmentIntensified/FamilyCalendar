/**
 * `ShellBadgeState` in node: the 99+ cap, the failure-is-zero rule, the
 * optimistic decrement and the stale-gated visibility refresh.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import type { ShellBadgePort } from './shell.contract';
import { ShellBadgeState } from './shell.badge.state.svelte.js';

function portOf(answers: Array<number | Error>): ShellBadgePort & { readonly calls: number } {
	let calls = 0;
	return {
		get calls() {
			return calls;
		},
		unreadCount: async () => {
			const answer = answers[Math.min(calls, answers.length - 1)];
			calls++;
			if (answer instanceof Error) throw answer;
			return answer;
		}
	};
}

function stateOf(port: ShellBadgePort, clock: { now: number }) {
	return new ShellBadgeState(port, { now: () => clock.now });
}

describe('ShellBadgeState', () => {
	it('caps the badge at 99+ and treats a failed count as 0', async () => {
		const port = portOf([120]);
		const state = stateOf(port, { now: 0 });
		await state.refresh();
		expect(state.count).toBe(120);
		expect(state.label).toBe('99+');

		const failing = stateOf(portOf([new Error('offline')]), { now: 0 });
		await failing.refresh();
		expect(failing.count).toBe(0);
		expect(failing.label).toBe('0');
	});

	it('decrements optimistically without going negative', async () => {
		const state = stateOf(portOf([3]), { now: 0 });
		await state.refresh();
		state.markRead();
		expect(state.count).toBe(2);
		state.markRead(5);
		expect(state.count).toBe(0);
	});

	it('refreshes on visibility only once the count is older than a minute', async () => {
		const clock = { now: 1_000_000 };
		const port = portOf([4, 5]);
		const state = stateOf(port, clock);
		await state.refresh();
		expect(port.calls).toBe(1);

		clock.now += 30_000;
		await state.refreshIfStale();
		expect(port.calls).toBe(1);

		clock.now += 31_000;
		await state.refreshIfStale();
		expect(port.calls).toBe(2);
		expect(state.count).toBe(5);
	});
});
