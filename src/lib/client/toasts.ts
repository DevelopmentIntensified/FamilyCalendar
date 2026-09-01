import { writable } from 'svelte/store';

export interface Toast {
	id: number;
	message: string;
	/** Optional action button (e.g. "Undo") shown on the right. */
	actionLabel?: string;
	onAction?: () => void;
}

export const toasts = writable<Toast[]>([]);

let nextId = 1;
const AUTO_DISMISS_MS = 6000;

export function pushToast(t: Omit<Toast, 'id'>): number {
	const id = nextId++;
	toasts.update((list) => [...list.slice(-3), { ...t, id }]);
	setTimeout(() => dismissToast(id), AUTO_DISMISS_MS);
	return id;
}

export function dismissToast(id: number) {
	toasts.update((list) => list.filter((t) => t.id !== id));
}