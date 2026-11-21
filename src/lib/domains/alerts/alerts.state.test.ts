/**
 * The Alerts page state, in node with a fake api and `memoryToasts()`: the
 * chip counts over the whole feed, the optimistic mark-all and delete-read
 * with their reverts, and the row tap's read-mark-then-navigate.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it, vi } from 'vitest';
import { memoryToasts } from '$lib/kernel/client/toasts.svelte.js';
import type { AlertRow } from './alerts.contract';
import type { AlertsApi } from './alerts.api';
import { AlertsState } from './alerts.state.svelte.js';

const NOW = new Date('2026-11-21T12:00:00.000Z');
const ZONE = 'UTC';

type FeedApi = Pick<AlertsApi, 'mark' | 'markAll' | 'prune'>;

function row(over: Partial<AlertRow> = {}): AlertRow {
	return {
		id: 'n1',
		type: 'task_completed',
		rawType: 'task_completed',
		group: 'news',
		actorName: 'Sarah',
		message: 'completed "Weekly meal plan"',
		link: '/calendar/tasks',
		readAt: null,
		createdAt: '2026-11-19 09:00:00+00',
		...over
	};
}

const FEED: AlertRow[] = [
	row({ id: 'n1', message: 'completed "Weekly meal plan"' }),
	row({
		id: 'n2',
		type: 'assignment_pending',
		rawType: 'assignment_pending',
		group: 'needs_you',
		message: 'asked you to book the wall'
	}),
	row({
		id: 'n3',
		type: 'added_to_family',
		rawType: 'added_to_family',
		message: 'added Eli to the Hopper family',
		link: '/family'
	}),
	row({
		id: 'n4',
		type: 'assignment_declined',
		rawType: 'assignment_declined',
		group: 'needs_you',
		message: 'declined the school forms'
	}),
	row({
		id: 'n5',
		type: 'assignment_accepted',
		rawType: 'assignment_accepted',
		message: 'accepted "Take the bins out"',
		readAt: '2026-11-20 10:00:00+00'
	})
];

function fakeApi(over: Partial<FeedApi> = {}): FeedApi {
	return {
		mark: async () => ({ ok: true as const, data: { success: true as const } }),
		markAll: async () => ({ ok: true as const, data: { success: true as const } }),
		prune: async () => ({
			ok: true as const,
			data: { success: true as const, removed: 0 }
		}),
		...over
	};
}

function makeState(over: {
	api?: FeedApi;
	rows?: AlertRow[];
	unreadCount?: number;
	refresh?: () => void | Promise<void>;
	navigate?: (link: string) => void | Promise<void>;
} = {}) {
	const toasts = memoryToasts();
	const refresh = vi.fn(over.refresh ?? (() => {}));
	const navigate = vi.fn(over.navigate ?? (() => {}));
	const state = new AlertsState(
		over.api ?? fakeApi(),
		toasts,
		{ notifications: over.rows ?? FEED, unreadCount: over.unreadCount ?? 4 },
		{ refresh, navigate, now: NOW, zone: ZONE }
	);
	return { state, toasts, refresh, navigate };
}

describe('alerts state — chip counts', () => {
	it('counts the whole feed, and keeps the counts while a filter is active', () => {
		const { state } = makeState();
		state.setFilter('unread');
		expect(state.counts).toEqual({ all: 5, needsYou: 2, unread: 4 });
	});

	it('narrows the sections to the active chip', () => {
		const { state } = makeState();
		state.setFilter('needs_you');
		expect(state.groups.needsYou.map((r) => r.id)).toEqual(['n2', 'n4']);
		expect(state.groups.news).toEqual([]);
	});

	it('counts read rows for the delete question', () => {
		const { state } = makeState();
		expect(state.readCount).toBe(1);
	});
});

describe('alerts state — mark all read', () => {
	it('marks everything optimistically, toasts and reloads', async () => {
		const api = fakeApi();
		const markAll = vi.spyOn(api, 'markAll');
		const { state, toasts, refresh } = makeState({ api });
		await state.markAllRead();
		expect(markAll).toHaveBeenCalledOnce();
		expect(state.unreadCount).toBe(0);
		expect(state.rows.every((r) => r.readAt)).toBe(true);
		expect(toasts.items).toEqual([{ kind: 'success', text: 'Everything marked as read.' }]);
		expect(refresh).toHaveBeenCalledOnce();
	});

	it('reverts and says so when the server refuses', async () => {
		const { state, toasts, refresh } = makeState({
			api: fakeApi({
				markAll: async () => ({ ok: false as const, status: 500, error: 'boom' })
			})
		});
		const before = state.rows;
		await state.markAllRead();
		expect(state.rows).toEqual(before);
		expect(state.unreadCount).toBe(4);
		expect(toasts.items).toEqual([
			{ kind: 'error', text: "Couldn't mark everything read — try again." }
		]);
		expect(refresh).not.toHaveBeenCalled();
	});
});

describe('alerts state — delete read', () => {
	it('asks first, then drops the read rows and names the count', async () => {
		const api = fakeApi();
		const prune = vi.spyOn(api, 'prune');
		const { state, toasts, refresh } = makeState({ api });
		state.askToPrune();
		expect(state.askingToPrune).toBe(true);
		await state.pruneRead();
		expect(prune).toHaveBeenCalledOnce();
		expect(state.askingToPrune).toBe(false);
		expect(state.rows.map((r) => r.id)).toEqual(['n1', 'n2', 'n3', 'n4']);
		expect(toasts.items).toEqual([{ kind: 'success', text: 'Deleted 1 read alert.' }]);
		expect(refresh).toHaveBeenCalledOnce();
	});

	it('pluralises the count', async () => {
		const rows = [
			row({ id: 'a', readAt: '2026-11-20 10:00:00+00' }),
			row({ id: 'b', readAt: '2026-11-20 10:00:00+00' }),
			row({ id: 'c' })
		];
		const { state, toasts } = makeState({ rows, unreadCount: 1 });
		await state.pruneRead();
		expect(toasts.items).toEqual([{ kind: 'success', text: 'Deleted 2 read alerts.' }]);
	});

	it('puts the rows back when the delete is refused', async () => {
		const { state, toasts } = makeState({
			api: fakeApi({ prune: async () => ({ ok: false as const, status: 500, error: 'boom' }) })
		});
		const before = state.rows;
		await state.pruneRead();
		expect(state.rows).toEqual(before);
		expect(toasts.items).toEqual([
			{ kind: 'error', text: "Couldn't delete those alerts — try again." }
		]);
	});

	it('leaves the confirmation open until it is answered or cancelled', () => {
		const { state } = makeState();
		state.askToPrune();
		state.cancelPrune();
		expect(state.askingToPrune).toBe(false);
	});
});

describe('alerts state — a row tap', () => {
	it('marks an unread row read, reloads, then navigates', async () => {
		const api = fakeApi();
		const mark = vi.spyOn(api, 'mark');
		const { state, refresh, navigate } = makeState({ api });
		const target = FEED[1];
		await state.openRow(target);
		expect(mark).toHaveBeenCalledWith('n2');
		expect(state.unreadCount).toBe(3);
		expect(state.rows.find((r) => r.id === 'n2')?.readAt).not.toBeNull();
		expect(refresh).toHaveBeenCalledOnce();
		expect(navigate).toHaveBeenCalledWith('/calendar/tasks');
	});

	it('does not re-POST a row that is already read', async () => {
		const api = fakeApi();
		const mark = vi.spyOn(api, 'mark');
		const { state, navigate } = makeState({ api });
		await state.openRow(FEED[4]);
		expect(mark).not.toHaveBeenCalled();
		expect(navigate).toHaveBeenCalledWith('/calendar/tasks');
	});

	it('says the mark failed but still opens the link', async () => {
		const { state, toasts, navigate } = makeState({
			api: fakeApi({ mark: async () => ({ ok: false as const, status: 500, error: 'boom' }) })
		});
		await state.openRow(FEED[0]);
		expect(toasts.items).toEqual([
			{ kind: 'error', text: "Couldn't mark that alert read — opening it anyway." }
		]);
		expect(navigate).toHaveBeenCalledWith('/calendar/tasks');
	});

	it('adopts a fresh server read', () => {
		const { state } = makeState();
		state.reset({ notifications: [row({ id: 'only' })], unreadCount: 1 });
		expect(state.rows.map((r) => r.id)).toEqual(['only']);
		expect(state.unreadCount).toBe(1);
	});
});
