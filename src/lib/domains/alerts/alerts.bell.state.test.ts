/**
 * The bell state, in node with a fake api and `memoryToasts()`: the badge cap,
 * the dropdown read, mark-read-then-navigate with its restore, mark-all, and
 * the push section's state and failure copy.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it, vi } from 'vitest';
import { memoryToasts } from '$lib/kernel/client/toasts.svelte.js';
import type { Scheduler } from '$lib/kernel/time/scheduler';
import type { AlertRow } from './alerts.contract';
import type { AlertsBellApi } from './alerts.bell.state.svelte.js';
import { AlertsBellState } from './alerts.bell.state.svelte.js';
import type { PushEnvironment } from './alerts.push.api';

const NOW = new Date('2026-11-21T12:00:00.000Z');
const ZONE = 'UTC';

/** Never fires: the push feedback's fade is not part of these assertions. */
const noSchedule: Scheduler = () => () => {};

function row(over: Partial<AlertRow> = {}): AlertRow {
	return {
		id: 'n1',
		type: 'assignment_pending',
		rawType: 'assignment_pending',
		group: 'needs_you',
		actorName: 'Sarah',
		message: 'asked you to book the wall',
		link: '/calendar/tasks',
		readAt: null,
		createdAt: '2026-11-19 09:00:00+00',
		...over
	};
}

function fakeApi(over: Partial<AlertsBellApi> = {}): AlertsBellApi {
	return {
		list: async () => ({
			ok: true as const,
			data: { notifications: [row()], unreadCount: 1 }
		}),
		mark: async () => ({ ok: true as const, data: { success: true as const } }),
		markAll: async () => ({ ok: true as const, data: { success: true as const } }),
		publicKey: async () => ({ ok: true as const, data: { publicKey: 'dGVzdA==' } }),
		subscribePush: async () => ({ ok: true as const, data: { success: true as const } }),
		unsubscribePush: async () => ({ ok: true as const, data: { success: true as const } }),
		...over
	};
}

function fakeEnv(over: Partial<PushEnvironment> = {}): PushEnvironment {
	return {
		supported: () => true,
		secure: () => true,
		permission: () => 'granted',
		requestPermission: async () => 'granted',
		registration: async () => null,
		...over
	};
}

function makeState(over: { api?: AlertsBellApi; env?: PushEnvironment } = {}) {
	const toasts = memoryToasts();
	const navigate = vi.fn(() => {});
	const state = new AlertsBellState(over.api ?? fakeApi(), toasts, {
		navigate,
		now: NOW,
		zone: ZONE,
		env: over.env ?? fakeEnv(),
		schedule: noSchedule
	});
	return { state, toasts, navigate };
}

describe('alerts bell — badge', () => {
	it('caps the badge at 99+', async () => {
		const { state } = makeState({
			api: fakeApi({
				list: async () => ({
					ok: true as const,
					data: { notifications: [], unreadCount: 120 }
				})
			})
		});
		await state.refreshCount();
		expect(state.badge).toBe('99+');
		expect(state.triggerLabel).toBe('Notifications (120 unread)');
	});

	it('says nothing unread in the trigger label when caught up', async () => {
		const { state } = makeState({
			api: fakeApi({
				list: async () => ({
					ok: true as const,
					data: { notifications: [], unreadCount: 0 }
				})
			})
		});
		await state.refreshCount();
		expect(state.triggerLabel).toBe('Notifications');
	});
});

describe('alerts bell — the dropdown read', () => {
	it('opening loads rows and the unread count together', async () => {
		const { state } = makeState();
		state.toggle();
		expect(state.open).toBe(true);
		await vi.waitFor(() => expect(state.rows).toHaveLength(1));
		expect(state.unreadCount).toBe(1);
		expect(state.loading).toBe(false);
	});

	it('reports a failed read and leaves the retry to the user', async () => {
		const { state } = makeState({
			api: fakeApi({
				list: async () => ({ ok: false as const, status: 500, error: 'boom' })
			})
		});
		state.toggle();
		await vi.waitFor(() => expect(state.loadError).toBe(true));
		expect(state.loading).toBe(false);
	});
});

describe('alerts bell — a row tap', () => {
	it('closes, marks read, restores on refusal, then navigates anyway', async () => {
		const { state, toasts, navigate } = makeState({
			api: fakeApi({
				mark: async () => ({ ok: false as const, status: 500, error: 'boom' })
			})
		});
		state.open = true;
		await state.load();
		await state.markRead(row());
		expect(state.open).toBe(false);
		expect(state.rows[0].readAt).toBeNull();
		expect(state.unreadCount).toBe(1);
		expect(toasts.items).toEqual([
			{ kind: 'error', text: "Couldn't mark that alert read — it stays in your list." }
		]);
		expect(navigate).toHaveBeenCalledWith('/calendar/tasks');
	});

	it('does not re-POST an already read row', async () => {
		const api = fakeApi();
		const mark = vi.spyOn(api, 'mark');
		const { state, navigate } = makeState({ api });
		await state.markRead(row({ readAt: '2026-11-20 10:00:00+00' }));
		expect(mark).not.toHaveBeenCalled();
		expect(navigate).toHaveBeenCalledWith('/calendar/tasks');
	});

	it('mark-all restores the unread count when refused', async () => {
		const { state } = makeState();
		await state.load();
		expect(state.unreadCount).toBe(1);
		const api = fakeApi({
			markAll: async () => ({ ok: false as const, status: 500, error: 'boom' })
		});
		const retry = makeState({ api });
		await retry.state.load();
		await retry.state.markAllRead();
		expect(retry.state.unreadCount).toBe(1);
		expect(retry.state.rows[0].readAt).toBeNull();
	});
});

describe('alerts bell — push section', () => {
	it('hides itself when the browser does not support push', async () => {
		const api = fakeApi();
		const publicKey = vi.spyOn(api, 'publicKey');
		const { state } = makeState({ api, env: fakeEnv({ supported: () => false }) });
		await state.initPush();
		expect(state.pushState).toBeNull();
		expect(publicKey).not.toHaveBeenCalled();
	});

	it('shows the enable button when the key is published', async () => {
		const { state } = makeState();
		await state.initPush();
		expect(state.pushState).toBe('unsubscribed');
		expect(state.pushServerReady).toBe(true);
	});

	it('hides the button when the server has no key', async () => {
		const { state } = makeState({
			api: fakeApi({ publicKey: async () => ({ ok: true as const, data: { publicKey: null } }) })
		});
		await state.initPush();
		expect(state.pushState).toBe('unsubscribed');
		expect(state.pushServerReady).toBe(false);
	});

	it('reports a failed enable with the approved sentence', async () => {
		const { state } = makeState();
		await state.initPush();
		await state.enablePush();
		expect(state.pushBusy).toBe(false);
		expect(state.pushState).toBe('unsubscribed');
		expect(state.pushFeedback).toEqual({
			kind: 'error',
			text: "Push isn't ready yet — reload the page and try again."
		});
	});
});
