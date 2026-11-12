/**
 * Debounced search with a stale-response guard, replacing the three hand-rolled
 * pickers (member picker, member search tab, location search). A newer query
 * aborts the older request; a late reply for an old query can never overwrite
 * newer results; a rejected search is reported as `failed` rather than as an
 * empty result (task K-07).
 *
 * Doc: src/lib/kernel/README.md#client
 */
import { systemScheduler, type Scheduler } from '../time/scheduler';

const DEFAULT_DEBOUNCE_MS = 250;
const DEFAULT_MIN_LENGTH = 2;

export class SearchBox<T> {
	query = $state('');
	results = $state<T[]>([]);
	/** True when the latest search rejected; the next query clears it. */
	failed = $state(false);
	/** The trimmed query the current results or failure belong to. */
	searchedFor = $state('');
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
		this.failed = false;

		const term = q.trim();
		if (term.length < this.minLength) {
			this.results = [];
			this.searchedFor = '';
			this.pending = false;
			return;
		}

		this.pending = true;
		const requestId = this.latest;
		this.cancelTimer = this.schedule(() => {
			this.cancelTimer = null;
			void this.run(term, requestId);
		}, this.debounceMs);
	}

	clear(): void {
		this.cancelInFlight();
		this.query = '';
		this.results = [];
		this.failed = false;
		this.searchedFor = '';
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

	private async run(term: string, requestId: number): Promise<void> {
		const controller = new AbortController();
		this.controller = controller;
		try {
			const results = await this.search(term, controller.signal);
			if (requestId !== this.latest) return;
			this.results = results;
			this.failed = false;
			this.searchedFor = term;
		} catch {
			if (requestId !== this.latest) return;
			// A picker must say the search failed; an empty list would read as
			// "no such person" and send the user down the wrong path.
			this.results = [];
			this.failed = true;
			this.searchedFor = term;
		} finally {
			if (requestId === this.latest) {
				this.controller = null;
				this.pending = false;
			}
		}
	}
}
