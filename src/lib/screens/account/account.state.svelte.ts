/**
 * The account screen's client state: which section is mounted, the per-section
 * model cache with its pending and failed states, and the export's toasts.
 *
 * Switching a section fetches its model once per visit (the hash is invisible to
 * the server, so the first paint only carries the profile section — Q-077); a
 * cached section renders instantly and a failed fetch leaves the retry control
 * and the error sentence on screen. The export acknowledges within 100 ms and
 * reports its outcome, exactly as the approved card does.
 *
 * The notification switches keep their own class: the flip is optimistic and a
 * failed save puts the switch back where the server still has it (alerts'
 * `saveOutcome` decides), which is a different promise from the section cache.
 *
 * No `$effect`: every side effect is a method, so both classes run in node with
 * a fake api and no DOM.
 *
 * Doc: ./README.md#invariants
 */
import type { SubmitFunction } from '@sveltejs/kit';
import type {
	AlertPreferenceId,
	AlertPreferences
} from '$lib/domains/alerts';
import { DEFAULT_ALERT_PREFERENCES, saveOutcome } from '$lib/domains/alerts';
import type { Toasts } from '$lib/kernel/client/toasts.svelte';
import type { AccountApi } from './account.api';
import type { AccountSectionModel } from './account.contract';
import type { AccountSectionId } from './account.sections.rules';

/**
 * What a route hands its page: SvelteKit's `enhance` action. Components take it
 * as a prop, so no component imports `$app/*` (port-ui step 5).
 */
export type AccountFormEnhancer = (
	node: HTMLFormElement,
	submit: SubmitFunction
) => { destroy(): void };

/** The sections the screen can hold; the load answers `profile`, the rest arrive lazily. */
type AccountSectionCache = Partial<Record<AccountSectionId, AccountSectionModel>>;

export class AccountScreenState {
	/** The section the hash names (or the load's default until the hash is read). */
	active = $state<AccountSectionId>('profile');
	/** The model of every section fetched in this visit. */
	models = $state<AccountSectionCache>({});
	/** The section whose fetch is in flight, if any. */
	loading = $state<AccountSectionId | null>(null);
	/** The last failed fetch's sentence; cleared by a retry. */
	error = $state<string | null>(null);
	/** The export button's pending state. */
	exporting = $state(false);

	private readonly api: AccountApi;
	private readonly toasts: Toasts;
	/** The page load's instant, used for the download's dated filename. */
	private readonly now: Date;

	constructor(api: AccountApi, toasts: Toasts, initial: AccountSectionModel, now: Date) {
		this.api = api;
		this.toasts = toasts;
		this.now = now;
		this.models = { [initial.section]: initial };
	}

	/** The mounted section's model, or null while it is still arriving. */
	model(): AccountSectionModel | null {
		return this.models[this.active] ?? null;
	}

	/** Show a section, fetching its model when this visit has not seen it yet. */
	select(section: AccountSectionId): Promise<void> {
		this.active = section;
		if (this.models[section] || this.loading === section) return Promise.resolve();
		return this.load(section);
	}

	/** Fetch one section's model; the retry control calls this again. */
	async load(section: AccountSectionId): Promise<void> {
		this.loading = section;
		this.error = null;
		const result = await this.api.fetchSection(section);
		this.loading = null;
		if (!result.ok) {
			this.error = result.error;
			return;
		}
		this.models = { ...this.models, [result.data.section]: result.data };
	}

	/** Download the requester's export, acknowledging before it lands. */
	async exportData(): Promise<void> {
		if (this.exporting) return;
		this.exporting = true;
		this.toasts.info('Preparing your data export…');
		const result = await this.api.downloadExport(this.now);
		this.exporting = false;
		if (result.ok) {
			this.toasts.success('Data export downloaded.');
			return;
		}
		this.toasts.error('Data export failed — please try again.');
	}
}

/** What the card shows once a switch's save answers: the switches, the line, its tone. */
export type AccountPreferenceOutcome = {
	readonly preferences: AlertPreferences;
	readonly status: string;
	readonly isError: boolean;
};

/**
 * The four notification switches: the optimistic flip, its receipt, and the
 * revert to the server's value when the save refuses.
 *
 * The server value is captured before the flip; the revert never re-derives it
 * with `!intent.value`, which is only right while nothing else has moved.
 */
export class AccountNotificationsState {
	preferences = $state<AlertPreferences>({ ...DEFAULT_ALERT_PREFERENCES });
	/** The switch a save is in flight for; that row alone is disabled. */
	pendingId = $state<AlertPreferenceId | null>(null);
	/** The receipt or the did-not-save line; always rendered (a live region). */
	status = $state('');
	statusIsError = $state(false);

	/** The server's answer as this class last saw it. */
	private saved: AlertPreferences;
	/** The flip the in-flight save is asking for. */
	private intent: { readonly id: AlertPreferenceId; readonly value: boolean } | null = null;

	constructor(initial: AlertPreferences) {
		this.saved = { ...initial };
		this.preferences = { ...initial };
	}

	/** The loader's answer after a reload is truth again. */
	reset(initial: AlertPreferences): void {
		this.saved = { ...initial };
		this.preferences = { ...initial };
	}

	valueOf(id: AlertPreferenceId): boolean {
		return this.preferences[id];
	}

	/** The value this row's next click saves — the in-flight one while a save runs. */
	nextValue(id: AlertPreferenceId, on: boolean): boolean {
		if (this.intent?.id === id) return this.intent.value;
		return !on;
	}

	/** Ack first, ask later: the switch and the receipt both move now. */
	press(id: AlertPreferenceId): void {
		const value = !this.preferences[id];
		this.intent = { id, value };
		this.pendingId = id;
		const outcome = saveOutcome(this.saved, this.intent, true);
		this.preferences = outcome.preferences;
		this.status = outcome.status;
		this.statusIsError = false;
	}

	/** The save answered: keep the flip on success, put the switch back on failure. */
	settle(ok: boolean): void {
		const intent = this.intent;
		this.intent = null;
		this.pendingId = null;
		if (!intent) return;
		const outcome = saveOutcome(this.saved, intent, ok);
		this.saved = outcome.preferences;
		this.preferences = outcome.preferences;
		this.status = outcome.status;
		this.statusIsError = outcome.isError;
	}
}
