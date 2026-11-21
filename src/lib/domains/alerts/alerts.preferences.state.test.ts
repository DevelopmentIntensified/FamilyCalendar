/**
 * The account card's preference state, in node with a fake api: the optimistic
 * flip, its receipt, the revert to the server's value, and one save at a time.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it, vi } from 'vitest';
import type { AlertPreferences } from './alerts.contract';
import { AlertPreferencesState } from './alerts.preferences.state.svelte.js';

const STORED: AlertPreferences = {
	taskAssigned: true,
	taskCompleted: false,
	familyJoined: false,
	aiSuggestions: true
};

/** A save that stays in flight until the test settles it. */
function deferredSave() {
	const { promise, resolve } = Promise.withResolvers<
		| { ok: true; data: { success: true; message: string } }
		| { ok: false; status: number; error: string }
	>();
	return {
		settle: (ok: boolean) =>
			resolve(
				ok
					? { ok: true, data: { success: true, message: 'Task completed alerts are on. Saved.' } }
					: { ok: false, status: 500, error: 'Task completed alerts are on. This did not save.' }
			),
		promise
	};
}

describe('alerts preferences state', () => {
	it('shows the loader answer', () => {
		const state = new AlertPreferencesState(
			{ setPreference: async () => ({ ok: true, data: { success: true, message: '' } }) },
			STORED
		);
		expect(state.valueOf('taskCompleted')).toBe(false);
		expect(state.valueOf('aiSuggestions')).toBe(true);
	});

	it('flips optimistically, then confirms with the receipt', async () => {
		const api = {
			setPreference: vi.fn(async () => ({
				ok: true as const,
				data: { success: true as const, message: 'Task completed alerts are on. Saved.' }
			}))
		};
		const state = new AlertPreferencesState(api, STORED);
		await state.toggle('taskCompleted');
		expect(api.setPreference).toHaveBeenCalledWith('taskCompleted', true);
		expect(state.valueOf('taskCompleted')).toBe(true);
		expect(state.status).toBe('Task completed alerts are on.');
		expect(state.statusIsError).toBe(false);
		expect(state.pendingId).toBeNull();
	});

	it('puts the switch back where the server still has it when the save fails', async () => {
		const api = {
			setPreference: async () => ({ ok: false as const, status: 500, error: 'boom' })
		};
		const state = new AlertPreferencesState(api, STORED);
		await state.toggle('familyJoined');
		expect(state.valueOf('familyJoined')).toBe(false);
		expect(state.status).toBe('Someone joined the family didn’t save — try again.');
		expect(state.statusIsError).toBe(true);
	});

	it('takes one save at a time', async () => {
		const pending = deferredSave();
		const api = { setPreference: vi.fn(() => pending.promise) };
		const state = new AlertPreferencesState(api, STORED);
		const first = state.toggle('taskAssigned');
		expect(state.pendingId).toBe('taskAssigned');
		await state.toggle('aiSuggestions');
		expect(api.setPreference).toHaveBeenCalledTimes(1);
		pending.settle(true);
		await first;
		expect(state.pendingId).toBeNull();
	});

	it('adopts a fresh loader answer after a reload', () => {
		const state = new AlertPreferencesState(
			{ setPreference: async () => ({ ok: true, data: { success: true, message: '' } }) },
			STORED
		);
		state.reset({ ...STORED, taskCompleted: true });
		expect(state.valueOf('taskCompleted')).toBe(true);
	});
});
