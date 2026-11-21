/**
 * alerts bell state: the navbar bell's client state — the dropdown, the unread
 * badge, mark-read-then-navigate, mark-all, and the push section.
 *
 * The badge poll reuses the one `GET /api/notifications` the list reads: there
 * is no unread-count endpoint (Q-022 keeps it that way in this port). The poll
 * interval itself lives in the component (it is a lifecycle, not state).
 *
 * `now`/`zone`/`schedule` are constructor inputs so no clock, timer or zone is
 * read here (R5): the component passes `systemClock.now()`, the browser zone
 * and the kernel scheduler.
 *
 * Doc: ./README.md#public-interface
 */
import type { Toasts } from '$lib/kernel/client/toasts.svelte';
import type { Scheduler } from '$lib/kernel/time/scheduler';
import type { AlertRow } from './alerts.contract';
import type { AlertsApi } from './alerts.api';
import {
	getPushState,
	pushFailureText,
	subscribeToPush,
	unsubscribeFromPush,
	type PushEnvironment,
	type PushState
} from './alerts.push.api';

/** One line of push feedback under the bell: a success note or a failure reason. */
export type AlertPushFeedback = { readonly kind: 'success' | 'error'; readonly text: string };

/** What the bell hands its state: framework navigation, the pinned clock, the seams. */
export type AlertsBellDeps = {
	navigate(link: string): void | Promise<void>;
	/** The instant the bell mounted; optimistic stamps and age labels use it. */
	now: Date;
	/** The viewer's IANA zone, for the rows' relative labels. */
	zone: string;
	env: PushEnvironment;
	schedule: Scheduler;
};

/** The api calls the bell makes; `alertsApi` satisfies it. */
export type AlertsBellApi = Pick<
	AlertsApi,
	'list' | 'mark' | 'markAll' | 'publicKey' | 'subscribePush' | 'unsubscribePush'
>;

const PUSH_FEEDBACK_MS = 3000;

export class AlertsBellState {
	open = $state(false);
	loading = $state(false);
	loadError = $state(false);
	unreadCount = $state(0);
	rows = $state<AlertRow[]>([]);

	/** null until the push section has answered; 'unsupported' hides it. */
	pushState = $state<PushState | null>(null);
	/** The server published a key, so the enable button can work. */
	pushServerReady = $state(false);
	pushBusy = $state(false);
	pushFeedback = $state<AlertPushFeedback | null>(null);

	readonly now: Date;
	readonly zone: string;

	private readonly api: AlertsBellApi;
	private readonly toasts: Toasts;
	private readonly navigate: AlertsBellDeps['navigate'];
	private readonly env: PushEnvironment;
	private readonly schedule: Scheduler;
	private cancelFeedback: (() => void) | null = null;

	constructor(api: AlertsBellApi, toasts: Toasts, deps: AlertsBellDeps) {
		this.api = api;
		this.toasts = toasts;
		this.navigate = deps.navigate;
		this.now = deps.now;
		this.zone = deps.zone;
		this.env = deps.env;
		this.schedule = deps.schedule;
	}

	/** The badge's text; the bell shows it only while `unreadCount > 0`. */
	get badge(): string {
		return this.unreadCount > 99 ? '99+' : String(this.unreadCount);
	}

	/** The trigger's accessible name. */
	get triggerLabel(): string {
		return this.unreadCount > 0 ? `Notifications (${this.unreadCount} unread)` : 'Notifications';
	}

	toggle(): void {
		this.open = !this.open;
		if (this.open) void this.load();
	}

	close(): void {
		this.open = false;
	}

	/** The dropdown's full read: rows and the unread count together. */
	async load(): Promise<void> {
		this.loading = true;
		this.loadError = false;
		const result = await this.api.list();
		if (!result.ok) {
			this.loadError = true;
			this.loading = false;
			return;
		}
		this.rows = result.data.notifications;
		this.unreadCount = result.data.unreadCount;
		this.loading = false;
	}

	/** The badge poll: one silent read, only the count is taken. */
	async refreshCount(): Promise<void> {
		const result = await this.api.list();
		if (result.ok) this.unreadCount = result.data.unreadCount;
	}

	/**
	 * A row tap: close the dropdown, mark read optimistically, then open the
	 * deep link. A refused mark restores the row and says it stays in the list.
	 */
	async markRead(row: AlertRow): Promise<void> {
		this.open = false;
		if (!row.readAt) {
			const stamp = this.now.toISOString();
			this.rows = this.rows.map((current) =>
				current.id === row.id ? { ...current, readAt: stamp } : current
			);
			this.unreadCount = Math.max(0, this.unreadCount - 1);
			const result = await this.api.mark(row.id);
			if (!result.ok) {
				this.rows = this.rows.map((current) =>
					current.id === row.id ? { ...current, readAt: null } : current
				);
				this.unreadCount += 1;
				this.toasts.error("Couldn't mark that alert read — it stays in your list.");
			}
		}
		if (row.link) await this.navigate(row.link);
	}

	/** Mark every row read optimistically; a refusal restores the unread count. */
	async markAllRead(): Promise<void> {
		const before = this.rows;
		const stamp = this.now.toISOString();
		this.rows = this.rows.map((row) => ({ ...row, readAt: row.readAt ?? stamp }));
		this.unreadCount = 0;
		const result = await this.api.markAll();
		if (!result.ok) {
			this.rows = before;
			this.unreadCount = before.filter((row) => !row.readAt).length;
			this.toasts.error("Couldn't mark everything read — try again.");
		}
	}

	/**
	 * The push section's first read: whether the browser supports push and
	 * whether the server published a key. Unsupported hides the section.
	 */
	async initPush(): Promise<void> {
		if (!this.env.supported()) return;
		const [state, key] = await Promise.all([getPushState(this.env), this.api.publicKey()]);
		this.pushState = state;
		this.pushServerReady = key.ok && key.data.publicKey !== null;
	}

	async enablePush(): Promise<void> {
		this.pushBusy = true;
		this.showPushFeedback(null);
		const result = await subscribeToPush(this.api, this.env);
		this.pushState = await getPushState(this.env);
		this.pushBusy = false;
		this.showPushFeedback(
			result.ok
				? { kind: 'success', text: 'Push notifications enabled.' }
				: { kind: 'error', text: pushFailureText(result.reason) }
		);
	}

	async disablePush(): Promise<void> {
		this.pushBusy = true;
		await unsubscribeFromPush(this.api, this.env);
		this.pushState = await getPushState(this.env);
		this.pushBusy = false;
	}

	/** Show one line of push feedback and let it fade, as the legacy bell did. */
	private showPushFeedback(feedback: AlertPushFeedback | null): void {
		this.cancelFeedback?.();
		this.pushFeedback = feedback;
		if (!feedback) return;
		this.cancelFeedback = this.schedule(() => {
			this.pushFeedback = null;
		}, PUSH_FEEDBACK_MS);
	}
}
