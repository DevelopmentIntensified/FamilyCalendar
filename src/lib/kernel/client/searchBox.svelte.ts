/**
 * Debounced search with a stale-response guard, replacing the three hand-rolled
 * pickers (member picker, member search tab, location search). A newer query
 * aborts the older request, and a late reply for an old query can never
 * overwrite newer results (task K-07).
 *
 * Doc: src/lib/kernel/README.md#client
 */
import { systemScheduler, type Scheduler } from './toasts.svelte.js';

const DEFAULT_DEBOUNCE_MS = 250;
const DEFAULT_MIN_LENGTH = 2;

export class SearchBox<T> {
	query = $state('');
	results = $state<T[]>([]);
	pending = $state(false);

	private readonly search: (q: string, signal: AbortSignal) => Promise<T[]>;
	private readonly debounceMs: number;
	private readonly minLength: number;
	private readonly schedule: Scheduler;
	private cancelTimer: (() => void) | null = null;
	private controller: AbortController | null = null;
	private latest = 0;

	constructor(
		search: (q: string, signal: AbortSignal) => Promise<T[]>,
		opts: { debounceMs?: number; minLength?: number; schedule?: Scheduler } = {}
	) {
		this.search = search;
		this.debounceMs = opts.debounceMs ?? DEFAULT_DEBOUNCE_MS;
		this.minLength = opts.minLength ?? DEFAULT_MIN_LENGTH;
		this.schedule = opts.schedule ?? systemScheduler;
	}

	setQuery(q: string): void {
		this.cancelInFlight();
		this.query = q;

		if (q.length < this.minLength) {
			this.results = [];
			this.pending = false;
			return;
		}

		this.pending = true;
		const requestId = this.latest;
		this.cancelTimer = this.schedule(() => {
			this.cancelTimer = null;
			void this.run(q, requestId);
		}, this.debounceMs);
	}

	clear(): void {
		this.cancelInFlight();
		this.query = '';
		this.results = [];
		this.pending = false;
	}

	/** Drops the pending debounce and aborts a request in flight. */
	private cancelInFlight(): void {
		this.latest += 1;
		this.cancelTimer?.();
		this.cancelTimer = null;
		this.controller?.abort();
		this.controller = null;
	}

	private async run(q: string, requestId: number): Promise<void> {
		const controller = new AbortController();
		this.controller = controller;
		try {
			const results = await this.search(q, controller.signal);
			if (requestId !== this.latest) return;
			this.results = results;
		} catch {
			if (requestId !== this.latest) return;
			this.results = [];
		} finally {
			if (requestId === this.latest) {
				this.controller = null;
				this.pending = false;
			}
		}
	}
}
