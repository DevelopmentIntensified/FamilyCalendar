/**
 * alerts page state: the Alerts feed's client state — the filter, the two
 * counts, mark-all, delete-read and the row tap.
 *
 * The page's server rows stay the source of truth: every write flips the UI
 * optimistically, then `refresh()` (the route's `invalidateAll`) reconciles
 * them. A refused write restores what the server still has and says so.
 *
 * `now`/`zone` are constructor inputs (R5): the optimistic read stamp and the
 * rows' age labels never read a hidden clock. The screen passes
 * `systemClock.now()` and the browser zone.
 *
 * Doc: ./README.md#public-interface
 */
import type { Toasts } from '$lib/kernel/client/toasts.svelte';
import type { AlertListResponse, AlertFilter, AlertRow } from './alerts.contract';
import type { AlertsApi } from './alerts.api';
import { alertCounts, filterAlerts, groupAlerts } from './alerts.feed.rules';

/** What the page hands its state: the framework functions and the pinned clock. */
export type AlertsStateDeps = {
	/** Re-read the page's server data (`invalidateAll`). */
	refresh(): void | Promise<void>;
	/** Client navigation to a row's deep link (`goto`). */
	navigate(link: string): void | Promise<void>;
	/** The instant this page was rendered; optimistic stamps and age labels use it. */
	now: Date;
	/** The viewer's IANA zone, for the rows' relative labels. */
	zone: string;
};

export class AlertsState {
	rows = $state<AlertRow[]>([]);
	unreadCount = $state(0);
	filter = $state<AlertFilter>('all');
	markingAll = $state(false);
	/** The delete-read confirmation is open. */
	askingToPrune = $state(false);
	pruning = $state(false);

	readonly now: Date;
	readonly zone: string;

	/** The chip counts, always over the whole loaded feed. */
	counts = $derived(alertCounts(this.rows));
	/** The filtered rows split into the two sections. */
	groups = $derived(groupAlerts(filterAlerts(this.rows, this.filter)));
	/** How many loaded rows are read — the delete-read count and its question. */
	readCount = $derived(this.rows.filter((row) => row.readAt).length);

	private readonly api: Pick<AlertsApi, 'mark' | 'markAll' | 'prune'>;
	private readonly toasts: Toasts;
	private readonly refresh: AlertsStateDeps['refresh'];
	private readonly navigate: AlertsStateDeps['navigate'];

	constructor(
		api: Pick<AlertsApi, 'mark' | 'markAll' | 'prune'>,
		toasts: Toasts,
		initial: AlertListResponse,
		deps: AlertsStateDeps
	) {
		this.api = api;
		this.toasts = toasts;
		this.refresh = deps.refresh;
		this.navigate = deps.navigate;
		this.now = deps.now;
		this.zone = deps.zone;
		this.reset(initial);
	}

	/** Adopt a fresh server read (a re-run load after `refresh()`). */
	reset(initial: AlertListResponse): void {
		this.rows = initial.notifications;
		this.unreadCount = initial.unreadCount;
	}

	/** Switch the chip; counts stay over the whole feed. */
	setFilter(filter: AlertFilter): void {
		this.filter = filter;
	}

	askToPrune(): void {
		this.askingToPrune = true;
	}

	cancelPrune(): void {
		this.askingToPrune = false;
	}

	/**
	 * The page's optimistic read stamp. Display-only: it is never serialised,
	 * and the next `refresh()` replaces it with the driver's wire render.
	 */
	private stampReadAt(row: AlertRow, stamp: string): AlertRow {
		return row.readAt ? row : { ...row, readAt: stamp };
	}

	/** Mark every loaded row read, then tell the server; revert on refusal. */
	async markAllRead(): Promise<void> {
		if (this.markingAll) return;
		this.markingAll = true;
		const beforeRows = this.rows;
		const beforeCount = this.unreadCount;
		const stamp = this.now.toISOString();
		this.rows = this.rows.map((row) => this.stampReadAt(row, stamp));
		this.unreadCount = 0;
		this.markingAll = false;
		const result = await this.api.markAll();
		if (!result.ok) {
			this.rows = beforeRows;
			this.unreadCount = beforeCount;
			this.toasts.error("Couldn't mark everything read — try again.");
			return;
		}
		this.toasts.success('Everything marked as read.');
		await this.refresh();
	}

	/**
	 * Drop the read rows from the feed, then tell the server to drop them.
	 * Counted before the rows go, so the toast says how many actually went.
	 */
	async pruneRead(): Promise<void> {
		if (this.pruning) return;
		this.pruning = true;
		const doomed = this.readCount;
		const before = this.rows;
		this.rows = this.rows.filter((row) => !row.readAt);
		this.askingToPrune = false;
		const result = await this.api.prune();
		if (!result.ok) {
			this.rows = before;
			this.toasts.error("Couldn't delete those alerts — try again.");
			this.pruning = false;
			return;
		}
		this.toasts.success(`Deleted ${doomed} read alert${doomed === 1 ? '' : 's'}.`);
		await this.refresh();
		this.pruning = false;
	}

	/**
	 * A plain row click: mark it read (optimistically) and open its deep link.
	 * The modified-click decision belongs to the row, which leaves those to the
	 * browser before calling here. An already-read row never re-POSTs.
	 */
	async openRow(row: AlertRow): Promise<void> {
		if (!row.readAt) {
			const stamp = this.now.toISOString();
			this.rows = this.rows.map((current) =>
				current.id === row.id ? this.stampReadAt(current, stamp) : current
			);
			this.unreadCount = Math.max(0, this.unreadCount - 1);
			const result = await this.api.mark(row.id);
			if (result.ok) {
				await this.refresh();
			} else {
				this.toasts.error("Couldn't mark that alert read — opening it anyway.");
			}
		}
		if (row.link) await this.navigate(row.link);
	}
}

/**
 * The viewer's IANA zone for relative labels. `Intl` is the browser's own
 * answer; `UTC` stands in when a runtime cannot give one (SSR, old engines).
 */
export function browserAlertZone(): string {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone;
	} catch {
		return 'UTC';
	}
}
