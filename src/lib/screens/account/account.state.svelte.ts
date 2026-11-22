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
 * The notification switches keep their own class in
 * `account.notifications.state.svelte.ts`, loaded with their section: the flip
 * is optimistic and a failed save puts the switch back where the server still
 * has it, which is a different promise from the section cache.
 *
 * No `$effect`: every side effect is a method, so the class runs in node with a
 * fake api and no DOM.
 *
 * Doc: ./README.md#invariants
 */
import type { SubmitFunction } from '@sveltejs/kit';
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
		// The Calendar section carries the dashboard module switches: they were one
		// page before the section split, and the legacy journey still reads them
		// there. The fetch is silent — a failed switches read leaves the calendar
		// form alone rather than replacing it with the retry card.
		const switches =
			section === 'calendar' ? this.loadCalendarModules() : Promise.resolve();
		const own =
			this.models[section] || this.loading === section ? Promise.resolve() : this.load(section);
		return Promise.all([switches, own]).then(() => undefined);
	}

	/** The module switches the Calendar section shows, cached like any other model. */
	private async loadCalendarModules(): Promise<void> {
		if (this.models.dashboard) return;
		const result = await this.api.fetchSection('dashboard');
		if (!result.ok) return;
		this.models = { ...this.models, [result.data.section]: result.data };
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
