/**
 * family create state: the `/family/create` page's client state.
 *
 * The picker's search is the create page's own door (`/api/family/member-search`,
 * issue 100) with a two-character floor, a 300 ms debounce and the caller plus
 * every pick excluded. The form itself posts to the page action; this class only
 * owns the submit acknowledgement ("Creating…") and the success toast, and it
 * keeps the picks so the approved preview can draw them above the picker.
 *
 * The debounce goes through the kernel scheduler port, injected, so a test
 * fires the callback itself and nothing waits on a real timer.
 *
 * Doc: ./README.md#public-interface
 */
import type { SubmitFunction } from '@sveltejs/kit';
import type { Toasts } from '$lib/kernel/client/toasts.svelte';
import { systemScheduler, type Scheduler } from '$lib/kernel/time/scheduler';
import type { FamilyApi } from './family.api';
import type { MemberSearchHit } from './family.contract';
import { MEMBER_SEARCH_MIN_QUERY } from './family.search.rules';

/** The search's debounce (legacy 300 ms). */
export const FAMILY_CREATE_SEARCH_MS = 300;

/**
 * The `$app/forms` `enhance` action's shape, declared here so the screen can
 * take it as a prop and never import `$app/*` (rule R8 keeps that in the route).
 */
export type FamilyFormEnhancer = (
	node: HTMLFormElement,
	submit: SubmitFunction
) => { destroy(): void };

/** What the page action's result type means for the toast: only a create confirms. */
export function familyCreateConfirmed(resultType: string): boolean {
	return resultType === 'redirect' || resultType === 'success';
}

export class FamilyCreateState {
	/** The name as typed; the action echoes it back on a refusal. */
	name = $state('');
	/** The chosen swatch; the palette default until somebody picks. */
	color = $state('');
	/** The people picked so far, mirrored up from the picker for the preview. */
	picked = $state<MemberSearchHit[]>([]);
	/** The current search text and its answer. */
	query = $state('');
	results = $state<MemberSearchHit[]>([]);
	searchedFor = $state('');
	searching = $state(false);
	searchFailed = $state(false);
	/** The submit is in flight: the button reads "Creating…" and is disabled. */
	submitting = $state(false);

	private readonly api: FamilyApi;
	private readonly toasts: Toasts;
	private readonly schedule: Scheduler;
	private cancelSearch: (() => void) | null = null;
	private requestId = 0;

	constructor(
		api: FamilyApi,
		toasts: Toasts,
		initial: { readonly name?: string; readonly color: string },
		schedule: Scheduler = systemScheduler
	) {
		this.api = api;
		this.toasts = toasts;
		this.schedule = schedule;
		this.name = initial.name ?? '';
		this.color = initial.color;
	}

	/** Type in the search box: clear short terms, otherwise search after the debounce. */
	setQuery(value: string): void {
		this.query = value;
		this.cancelSearch?.();
		const term = value.trim();
		if (term.length < MEMBER_SEARCH_MIN_QUERY) {
			this.results = [];
			this.searchedFor = '';
			this.searchFailed = false;
			return;
		}
		this.cancelSearch = this.schedule(() => void this.search(term), FAMILY_CREATE_SEARCH_MS);
	}

	/** Ask the picker door for verified prefixes, the caller and the picks excluded. */
	async search(term: string): Promise<void> {
		const requestId = ++this.requestId;
		this.searching = true;
		this.searchFailed = false;
		const result = await this.api.searchMembers(
			term,
			this.picked.map((person) => person.id)
		);
		if (requestId !== this.requestId) return;
		this.searching = false;
		if (!result.ok) {
			this.results = [];
			this.searchedFor = term;
			this.searchFailed = true;
			return;
		}
		this.results = result.data.users;
		this.searchedFor = term;
	}

	/** Pick a person: they move from the results into the strip, and the box clears. */
	add(person: MemberSearchHit): void {
		this.cancelSearch?.();
		if (this.picked.some((picked) => picked.id === person.id)) return;
		this.picked = [...this.picked, person];
		this.query = '';
		this.results = [];
		this.searchedFor = '';
	}

	/** Drop a pick; the door may offer them again on the next search. */
	remove(userId: string): void {
		this.picked = this.picked.filter((person) => person.id !== userId);
	}

	beginSubmit(): void {
		this.submitting = true;
	}

	/** The action came back; a redirect or success means the family exists. */
	finishSubmit(resultType: string): void {
		this.submitting = false;
		if (!familyCreateConfirmed(resultType)) return;
		const created = this.name.trim() || 'Your family';
		this.toasts.success(`${created} created — opening it now`);
	}
}
