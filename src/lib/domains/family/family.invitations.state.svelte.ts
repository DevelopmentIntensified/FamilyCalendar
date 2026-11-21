/**
 * family invitations state: the `/family/invitations` page's client state.
 *
 * The New-code band mints through `/api/family/invite` with the validity and
 * max-use numbers it offers; a revoke asks the same route to delete one code.
 * Both acknowledge in the click tick, then refresh the page's data (the loader
 * is the truth) and toast the outcome. Copy has its own inline confirmation —
 * "Copied ✓" beside the link — and clears itself after a moment.
 *
 * `refresh` is the route's `invalidateAll`, injected; the copy function and the
 * scheduler are injected too, so the class is tested in node with no DOM.
 *
 * Doc: ./README.md#public-interface
 */
import type { Toasts } from '$lib/kernel/client/toasts.svelte';
import { systemScheduler, type Scheduler } from '$lib/kernel/time/scheduler';
import type { FamilyApi } from './family.api';
import type { FamilyCopy } from './family.home.state.svelte';
import {
	FAMILY_INVITE_DEFAULT_DAYS,
	FAMILY_INVITE_DEFAULT_USES,
	familyCodeRevokedToast,
	familyNewCodeToast
} from './family.invitations.rules';

/** How long the "Copied ✓" state stays up before the button resets. */
export const FAMILY_COPY_RESET_MS = 2000;

export class FamilyInvitationsState {
	/** The New-code form's two numbers, as strings while they sit in the inputs. */
	validityDays = $state<number>(FAMILY_INVITE_DEFAULT_DAYS);
	maxUses = $state<number>(FAMILY_INVITE_DEFAULT_USES);
	/** A mint is in flight: the button reads "Creating…". */
	creating = $state(false);
	/** The code being revoked, so only that button says "Revoking…". */
	revokingCode = $state('');
	/** The last refusal, shown as the page's alert banner. */
	error = $state('');
	/** The code whose copy succeeded / failed, for the inline line under its link. */
	copiedCode = $state('');
	copyFailedCode = $state('');

	private readonly api: FamilyApi;
	private readonly toasts: Toasts;
	private readonly refresh: () => Promise<void>;
	private readonly copy: FamilyCopy;
	private readonly schedule: Scheduler;
	private cancelReset: (() => void) | null = null;

	constructor(
		api: FamilyApi,
		toasts: Toasts,
		refresh: () => Promise<void>,
		copy: FamilyCopy,
		schedule: Scheduler = systemScheduler
	) {
		this.api = api;
		this.toasts = toasts;
		this.refresh = refresh;
		this.copy = copy;
		this.schedule = schedule;
	}

	/** Mint one code for the family on screen, then re-read the page. */
	async createCode(familyId: string): Promise<void> {
		if (this.creating) return;
		this.creating = true;
		this.error = '';
		const result = await this.api.mintInvite(
			familyId,
			Number(this.validityDays),
			Number(this.maxUses)
		);
		this.creating = false;
		if (!result.ok) {
			this.error = result.error;
			this.toasts.error(`Couldn't make a new code — ${result.error}`);
			return;
		}
		await this.refresh();
		this.toasts.success(familyNewCodeToast(result.data.code));
	}

	/** Revoke one code: acknowledged per row, then re-read the page. */
	async revoke(code: string): Promise<void> {
		if (this.revokingCode) return;
		this.revokingCode = code;
		this.error = '';
		const result = await this.api.revokeInvite(code);
		this.revokingCode = '';
		if (!result.ok) {
			this.error = result.error;
			this.toasts.error(`Couldn't revoke ${code} — ${result.error}`);
			return;
		}
		await this.refresh();
		this.toasts.success(familyCodeRevokedToast(code));
	}

	/** Copy one join link and show "Copied ✓" beside it for a moment. */
	async copyLink(code: string, url: string, familyName: string): Promise<void> {
		const outcome = await this.copy(url, `Join ${familyName}`);
		if (outcome === 'cancelled') return;
		const failed = outcome === 'failed';
		this.copiedCode = failed ? '' : code;
		this.copyFailedCode = failed ? code : '';
		this.cancelReset?.();
		this.cancelReset = this.schedule(() => {
			this.copiedCode = '';
			this.copyFailedCode = '';
		}, FAMILY_COPY_RESET_MS);
	}
}
