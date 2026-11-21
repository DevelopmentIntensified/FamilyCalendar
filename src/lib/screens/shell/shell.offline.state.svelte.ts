/**
 * shell offline state: the banner's three facts — online, pending mutations,
 * and the "Synced N changes." receipt (`OfflineBanner.svelte:17-84`).
 *
 * The banner is up while offline, while anything is pending, or while the
 * receipt is showing; the offline PARAGRAPH renders only when actually offline,
 * so a pending count never claims "offline". Coming back online re-reads the
 * pending count after 2 s (the queue's replay gets a head start) and the receipt
 * lasts 4 s.
 *
 * `schedule` is a constructor input (R5): the frame passes the kernel
 * scheduler, a test fires its tasks.
 *
 * Doc: ./README.md#invariants
 */
import type { Scheduler } from '$lib/kernel/time/scheduler';
import type { ShellOfflinePort } from './shell.contract';

/** How long "Synced N changes." stays up (legacy `4000`). */
const RECEIPT_MS = 4000;

/** The replay's head start before the pending count is re-read (legacy `2000`). */
const RECONNECT_MS = 2000;

export type ShellOfflineDeps = {
	readonly schedule: Scheduler;
};

export class ShellOfflineState {
	online = $state(true);
	pending = $state(0);
	/** The count that just synced; null while no receipt is up. */
	synced = $state<number | null>(null);

	private readonly port: ShellOfflinePort;
	private readonly deps: ShellOfflineDeps;
	private unsubscribe: (() => void) | null = null;
	private cancelReceipt: (() => void) | null = null;
	private cancelRefresh: (() => void) | null = null;

	constructor(port: ShellOfflinePort, deps: ShellOfflineDeps) {
		this.port = port;
		this.deps = deps;
	}

	/** True while the banner has anything to say. */
	get visible(): boolean {
		return !this.online || this.pending > 0 || this.synced !== null;
	}

	/** Subscribe to online/offline and read the first pending count. */
	async start(): Promise<void> {
		this.unsubscribe = this.port.subscribe((online) => {
			this.online = online;
			if (!online) {
				// Going offline cancels the receipt: "Synced" would be a lie.
				this.cancelReceipt?.();
				this.cancelReceipt = null;
				this.synced = null;
				return;
			}
			this.cancelRefresh?.();
			this.cancelRefresh = this.deps.schedule(() => void this.reconnect(), RECONNECT_MS);
		});
		await this.refresh(false);
	}

	/** Stop listening and drop both timers (the frame's `onMount` cleanup). */
	stop(): void {
		this.unsubscribe?.();
		this.unsubscribe = null;
		this.cancelReceipt?.();
		this.cancelReceipt = null;
		this.cancelRefresh?.();
		this.cancelRefresh = null;
	}

	/**
	 * The reconnect read: the queue's replay gets a 2 s head start, then the
	 * count is re-read and a drop to 0 announces the sync.
	 */
	async reconnect(): Promise<void> {
		await this.refresh(true);
	}

	/**
	 * Re-read the pending count. With `announceSync`, a count that reaches 0
	 * from above shows "Synced N changes." for 4 s.
	 */
	async refresh(announceSync: boolean): Promise<void> {
		const previous = this.pending;
		try {
			this.pending = await this.port.pendingCount();
		} catch {
			// A queue read that fails leaves the last known count standing; the
			// banner is not a fault surface.
			return;
		}
		if (!announceSync || previous === 0 || this.pending !== 0) return;
		this.synced = previous;
		this.cancelReceipt?.();
		this.cancelReceipt = this.deps.schedule(() => {
			this.synced = null;
			this.cancelReceipt = null;
		}, RECEIPT_MS);
	}
}
