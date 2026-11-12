/**
 * Runes toast list for optimistic UI: a screen reports success, error or info
 * and kernel/ui's Toaster (K-08a) renders it. Keeps the legacy rules (max four
 * visible, oldest dropped, six-second auto-dismiss, optional action button) from
 * `client/toasts.ts` (task K-07).
 *
 * Doc: src/lib/kernel/README.md#client
 */
import { systemScheduler, type Scheduler } from '../time/scheduler';

export type ToastKind = 'success' | 'error' | 'info';

/** The optional button a caller attaches, for example "Undo". */
export type ToastAction = { label: string; run: () => void };

export type ToastItem = {
	id: number;
	kind: ToastKind;
	text: string;
	action?: ToastAction;
};

export interface Toasts {
	success(text: string, action?: ToastAction): void;
	error(text: string, action?: ToastAction): void;
	info(text: string, action?: ToastAction): void;
}

const MAX_VISIBLE = 4;
const AUTO_DISMISS_MS = 6000;

export function createToasts(opts: { schedule?: Scheduler } = {}): Toasts & {
	readonly items: ToastItem[];
	dismiss(id: number): void;
} {
	const schedule = opts.schedule ?? systemScheduler;
	let items = $state<ToastItem[]>([]);
	let nextId = 1;

	function dismiss(id: number): void {
		items = items.filter((toast) => toast.id !== id);
	}

	function push(kind: ToastKind, text: string, action?: ToastAction): void {
		const id = nextId++;
		const item: ToastItem = action ? { id, kind, text, action } : { id, kind, text };
		items = [...items.slice(-(MAX_VISIBLE - 1)), item];
		schedule(() => dismiss(id), AUTO_DISMISS_MS);
	}

	return {
		get items() {
			return items;
		},
		dismiss,
		success: (text, action) => push('success', text, action),
		error: (text, action) => push('error', text, action),
		info: (text, action) => push('info', text, action)
	};
}

/** A plain recorder for state-class tests: no runes, no timers. */
export function memoryToasts(): Toasts & {
	items: { kind: ToastKind; text: string; action?: ToastAction }[];
} {
	const items: { kind: ToastKind; text: string; action?: ToastAction }[] = [];
	const record = (kind: ToastKind) => (text: string, action?: ToastAction) => {
		items.push(action ? { kind, text, action } : { kind, text });
	};
	return { items, success: record('success'), error: record('error'), info: record('info') };
}
