/**
 * shell badge state: the Alerts tab's unread count.
 *
 * One read per chrome mount (the legacy tab bar fetched on mount AND on every
 * route change AND while `md:hidden`, so desktop paid for a phone surface), a
 * stale-gated refresh on `visibilitychange`, and an optimistic decrement for
 * "mark read". A failed or non-ok read is `0`: the nav stays silent on a
 * transient failure (`BottomNav.svelte:21-51`).
 *
 * `now` is a constructor input (R5): the component passes the kernel clock, a
 * test passes a pinned instant. There is no timer here — the poll belongs to
 * the bell's own panel, not to the badge.
 *
 * Doc: ./README.md#invariants
 */
import type { ShellBadgePort } from './shell.contract';

/** The badge fits two digits; legacy capped the visual at 99+. */
const BADGE_CAP = 99;

/** A count older than this refreshes when the tab becomes visible again. */
const STALE_AFTER_MS = 60_000;

export type ShellBadgeDeps = {
	/** Epoch milliseconds; injected so no test reads the wall clock. */
	readonly now: () => number;
};

export class ShellBadgeState {
	/** The real count — the accessible name carries it untruncated. */
	count = $state(0);

	private readonly port: ShellBadgePort;
	private readonly deps: ShellBadgeDeps;
	private fetchedAt: number | null = null;

	constructor(port: ShellBadgePort, deps: ShellBadgeDeps) {
		this.port = port;
		this.deps = deps;
	}

	/** The badge's visual text: two digits, then `99+`. */
	get label(): string {
		return this.count > BADGE_CAP ? `${BADGE_CAP}+` : String(this.count);
	}

	/** Read the count; a rejection or a non-ok answer is `0`. */
	async refresh(): Promise<void> {
		try {
			this.count = await this.port.unreadCount();
		} catch {
			this.count = 0;
		}
		this.fetchedAt = this.deps.now();
	}

	/** The `visibilitychange` half: refresh only when the count has gone stale. */
	async refreshIfStale(): Promise<void> {
		if (this.fetchedAt !== null && this.deps.now() - this.fetchedAt < STALE_AFTER_MS) return;
		await this.refresh();
	}

	/** The bell's "mark read" half: show the new count before the server answers. */
	markRead(read = 1): void {
		this.count = Math.max(0, this.count - read);
	}
}
