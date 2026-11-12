/**
 * Runes toast list for optimistic UI: a screen reports success, error or info
 * and the kernel Toaster renders it. Keeps the legacy rules (max four visible,
 * oldest dropped, six-second auto-dismiss) from `client/toasts.ts` (task K-07).
 *
 * Doc: src/lib/kernel/README.md#client
 */

export type ToastKind = 'success' | 'error' | 'info';
export type ToastItem = { id: number; kind: ToastKind; text: string };

/** Runs `fn` after `ms`; the returned function cancels it. Tests pass a manual one. */
export type Scheduler = (fn: () => void, ms: number) => () => void;

export interface Toasts {
	success(text: string): void;
	error(text: string): void;
	info(text: string): void;
}

export const systemScheduler: Scheduler = (fn, ms) => {
	const handle = setTimeout(fn, ms);
	return () => clearTimeout(handle);
};

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

	function push(kind: ToastKind, text: string): void {
		const id = nextId++;
		items = [...items.slice(-(MAX_VISIBLE - 1)), { id, kind, text }];
		schedule(() => dismiss(id), AUTO_DISMISS_MS);
	}

	return {
		get items() {
			return items;
		},
		dismiss,
		success: (text) => push('success', text),
		error: (text) => push('error', text),
		info: (text) => push('info', text)
	};
}

/** A plain recorder for state-class tests: no runes, no timers. */
export function memoryToasts(): Toasts & { items: { kind: ToastKind; text: string }[] } {
	const items: { kind: ToastKind; text: string }[] = [];
	const record = (kind: ToastKind) => (text: string) => {
		items.push({ kind, text });
	};
	return { items, success: record('success'), error: record('error'), info: record('info') };
}
