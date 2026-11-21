/**
 * family add-member state: the `/family/[familyId]/members/add` page's client
 * state — the tab strip and success panel, and one state class per door (find,
 * invite, child), so each tab owns exactly its own fields and pending flags.
 *
 * Every door reports back as `FamilyAddOutcome` (ok, or the copy to show), so
 * the page decides once where a refusal appears; the failure copy itself comes
 * from `familyAddFailure`, which reads `{ error }` first, then a thrown server
 * `{ message }`, and never treats a non-2xx as success (issue 250).
 *
 * Doc: ./README.md#public-interface
 */
import { systemScheduler, type Scheduler } from '$lib/kernel/time/scheduler';
import type { FamilyApi } from './family.api';
import {
	FAMILY_ADD_NETWORK_FAILURE,
	familyAddSuccessCopy,
	type FamilyAddTab
} from './family.addMember.rules';
import type { MemberSearchHit } from './family.contract';
import type { FamilyCopy } from './family.home.state.svelte';

/** How long the add-member search waits after a keystroke (legacy 300 ms). */
export const FAMILY_ADD_SEARCH_MS = 300;

/** The minimum the invite-flow search accepts; shorter terms are not sent. */
export const FAMILY_ADD_MIN_QUERY = 2;

/** How long "Copied ✓" stays up after a copied invite link. */
export const FAMILY_ADD_COPY_RESET_MS = 2000;

/** One door's answer: done, or the sentence the page shows. */
export type FamilyAddOutcome = { readonly ok: true } | { readonly ok: false; readonly error: string };

/** The page shell: which tab is open, the one error banner and the success panel. */
export class FamilyAddMemberState {
	mode = $state<FamilyAddTab>('search');
	/** The last refusal from any door, shown above the pane. */
	error = $state('');
	/** A door succeeded: the form is replaced by the success panel. */
	success = $state(false);
	/** Set when an emailed invite went out — nobody has joined yet (issue 249). */
	invitedEmail = $state<string | null>(null);

	/** The success panel's heading and body, chosen once (see `familyAddSuccessCopy`). */
	successCopy = $derived(familyAddSuccessCopy(this.invitedEmail));

	selectMode(mode: FamilyAddTab): void {
		this.mode = mode;
		this.error = '';
	}

	fail(message: string): void {
		this.error = message;
	}

	clearError(): void {
		this.error = '';
	}

	/** A member joined, or an emailed invite left: the panel replaces the tabs. */
	added(invitedEmail: string | null = null): void {
		this.invitedEmail = invitedEmail;
		this.success = true;
		this.error = '';
	}
}

/**
 * The "Find someone" tab: a debounced exact-match search in THIS family and a
 * one-row confirmation before the direct add (so a click cannot add the wrong
 * person). Search failures are reported to the page, not shown as "no match".
 */
export class FamilyMemberSearchState {
	query = $state('');
	results = $state<MemberSearchHit[]>([]);
	selected = $state<MemberSearchHit | null>(null);
	searching = $state(false);
	searchedFor = $state('');
	inviting = $state(false);

	private readonly api: FamilyApi;
	private readonly familyId: string;
	private readonly onError: (message: string) => void;
	private readonly schedule: Scheduler;
	private cancelSearch: (() => void) | null = null;
	private requestId = 0;

	constructor(
		api: FamilyApi,
		familyId: string,
		onError: (message: string) => void,
		schedule: Scheduler = systemScheduler
	) {
		this.api = api;
		this.familyId = familyId;
		this.onError = onError;
		this.schedule = schedule;
	}

	setQuery(value: string): void {
		this.query = value;
		this.cancelSearch?.();
		if (value.trim().length < FAMILY_ADD_MIN_QUERY) {
			this.results = [];
			this.searchedFor = '';
			return;
		}
		this.cancelSearch = this.schedule(() => void this.search(), FAMILY_ADD_SEARCH_MS);
	}

	/** Ask the invite-flow door; a search that never arrived says so instead of "no match". */
	async search(): Promise<void> {
		const term = this.query.trim();
		const requestId = ++this.requestId;
		this.searching = true;
		const result = await this.api.searchInvitableMembers(term, this.familyId);
		if (requestId !== this.requestId) return;
		this.searching = false;
		this.searchedFor = term;
		if (!result.ok) {
			this.results = [];
			if (result.status === 0) this.onError(FAMILY_ADD_NETWORK_FAILURE);
			return;
		}
		this.results = result.data.users;
	}

	/** Choose one hit: the row becomes a confirmation card with the Add button. */
	select(user: MemberSearchHit): void {
		this.cancelSearch?.();
		this.selected = user;
		this.query = '';
		this.results = [];
		this.searchedFor = '';
	}

	clear(): void {
		this.selected = null;
	}

	/** Add the chosen person, or answer with the door's refusal copy. */
	async add(): Promise<FamilyAddOutcome> {
		const selected = this.selected;
		if (!selected || this.inviting) return { ok: false, error: '' };
		this.inviting = true;
		const result = await this.api.addDirect(this.familyId, selected.id);
		this.inviting = false;
		if (!result.ok) return { ok: false, error: result.error };
		return { ok: true };
	}
}

/**
 * The "Invite by email" tab: one form, two answers — send the invite, or mint
 * the same names a shareable link (which adds nobody yet). The minted link is
 * copied through the injected function and confirms itself inline.
 */
export class FamilyInviteFormState {
	email = $state('');
	firstName = $state('');
	lastName = $state('');
	sending = $state(false);
	generatingLink = $state(false);
	link = $state('');
	copiedLink = $state(false);
	wasShared = $state(false);
	copyFailed = $state(false);

	private readonly api: FamilyApi;
	private readonly familyId: string;
	private readonly copy: FamilyCopy;
	private readonly schedule: Scheduler;
	private cancelReset: (() => void) | null = null;

	constructor(
		api: FamilyApi,
		familyId: string,
		copy: FamilyCopy,
		schedule: Scheduler = systemScheduler
	) {
		this.api = api;
		this.familyId = familyId;
		this.copy = copy;
		this.schedule = schedule;
	}

	/** Both buttons need an address and both names (the mint button disables without them). */
	get complete(): boolean {
		return Boolean(this.email && this.firstName && this.lastName);
	}

	async send(): Promise<FamilyAddOutcome> {
		if (this.sending) return { ok: false, error: '' };
		this.sending = true;
		const result = await this.api.sendInviteEmail(this.familyId, {
			email: this.email,
			firstName: this.firstName,
			lastName: this.lastName
		});
		this.sending = false;
		if (!result.ok) return { ok: false, error: result.error };
		return { ok: true };
	}

	/** Mint the link these names would receive, clearing any older one first. */
	async mintLink(): Promise<FamilyAddOutcome> {
		if (this.generatingLink) return { ok: false, error: '' };
		this.generatingLink = true;
		this.link = '';
		this.copiedLink = false;
		this.copyFailed = false;
		const result = await this.api.mintInviteLink(this.familyId, {
			email: this.email,
			firstName: this.firstName,
			lastName: this.lastName
		});
		this.generatingLink = false;
		if (!result.ok) return { ok: false, error: result.error };
		this.link = result.data.link;
		return { ok: true };
	}

	async copyLink(): Promise<void> {
		if (!this.link) return;
		const outcome = await this.copy(this.link, 'Join our family');
		this.wasShared = outcome === 'shared';
		this.copyFailed = outcome === 'failed';
		this.copiedLink = this.wasShared || outcome === 'copied';
		if (outcome !== 'copied') return;
		this.cancelReset?.();
		this.cancelReset = this.schedule(() => {
			this.copiedLink = false;
		}, FAMILY_ADD_COPY_RESET_MS);
	}
}

/**
 * The "Create a child" tab: a real account with no password, created only with
 * an explicit consent tick (the checkbox is `required` in the markup and the
 * door refuses anything but `true`).
 */
export class FamilyChildFormState {
	firstName = $state('');
	lastName = $state('');
	email = $state('');
	consentAcknowledged = $state(false);
	creating = $state(false);

	private readonly api: FamilyApi;
	private readonly familyId: string;

	constructor(api: FamilyApi, familyId: string) {
		this.api = api;
		this.familyId = familyId;
	}

	async create(): Promise<FamilyAddOutcome> {
		if (this.creating) return { ok: false, error: '' };
		this.creating = true;
		const result = await this.api.addChild(this.familyId, {
			firstName: this.firstName,
			lastName: this.lastName,
			email: this.email,
			consentAcknowledged: this.consentAcknowledged
		});
		this.creating = false;
		if (!result.ok) return { ok: false, error: result.error };
		return { ok: true };
	}
}
