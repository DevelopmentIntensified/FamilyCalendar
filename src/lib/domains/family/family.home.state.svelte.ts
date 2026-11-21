/**
 * family home state: the `/family` list's client state — the Invite-by-link row
 * on each card and the rail's copy button.
 *
 * Both surfaces mint through the one `/api/family/invite` door and copy through
 * one `copy` function, so the two never disagree. Minting acknowledges in the
 * click tick (`mintingId`), then toasts the outcome; a minted link is shown for
 * the family it was minted for and never above another one. The copy state is
 * sticky, exactly as the approved page left it (the rail's line switches from
 * the expiry to "Copied — send it…").
 *
 * Runes and methods only — no `$effect` — so it is tested in node with a fake
 * api, `memoryToasts()` and a fake copy.
 *
 * Doc: ./README.md#public-interface
 */
import type { CopyOutcome } from '$lib/kernel/client/shareText';
import type { Toasts } from '$lib/kernel/client/toasts.svelte';
import type { FamilyApi } from './family.api';
import { FAMILY_INVITE_DEFAULT_DAYS, FAMILY_INVITE_DEFAULT_USES } from './family.invitations.rules';

/** Copy one link, the platform share sheet first (the page's `copyOrShare` prop). */
export type FamilyCopy = (text: string, title: string) => Promise<CopyOutcome>;

/** The join link the page just minted, and the family it belongs to. */
export type FamilyMintedLink = {
	readonly familyId: string;
	readonly code: string;
	readonly url: string;
};

export class FamilyHomeState {
	/** The family whose mint is in flight; its button reads "Making link…". */
	mintingId = $state('');
	/** The last minted link — shown only under its own family's row. */
	minted = $state<FamilyMintedLink | null>(null);
	/** The family whose minted link was copied. */
	copiedFamilyId = $state('');
	/** The family whose copy failed, so its row can say so. */
	copyFailedFamilyId = $state('');
	/** The rail code that was copied, and the one whose copy failed. */
	railCopiedCode = $state('');
	railCopyFailedCode = $state('');

	private readonly api: FamilyApi;
	private readonly toasts: Toasts;
	private readonly copy: FamilyCopy;

	constructor(api: FamilyApi, toasts: Toasts, copy: FamilyCopy) {
		this.api = api;
		this.toasts = toasts;
		this.copy = copy;
	}

	/** The URL to show under a family's row, or '' when the last mint was another family's. */
	linkFor(familyId: string): string {
		return this.minted?.familyId === familyId ? this.minted.url : '';
	}

	/** Mint a join link (10 people, 7 days) and toast it, or explain the refusal. */
	async mint(familyId: string, familyName: string): Promise<void> {
		if (this.mintingId) return;
		this.mintingId = familyId;
		const result = await this.api.mintInvite(
			familyId,
			FAMILY_INVITE_DEFAULT_DAYS,
			FAMILY_INVITE_DEFAULT_USES
		);
		this.mintingId = '';
		if (!result.ok) {
			this.toasts.error(`Couldn't make a join link for ${familyName} — try again.`);
			return;
		}
		this.minted = {
			familyId,
			code: result.data.code,
			url: result.data.inviteUrl
		};
		this.toasts.success(
			`Join link ready for ${familyName} — send it to them; it admits ${FAMILY_INVITE_DEFAULT_USES} people for ${FAMILY_INVITE_DEFAULT_DAYS} days.`
		);
	}

	/** Copy the minted link of one family (share sheet, clipboard, or honest failure). */
	async copyMinted(origin: string, familyId: string, familyName: string): Promise<void> {
		const url = this.linkFor(familyId);
		if (!url) return;
		const outcome = await this.copy(origin + url, `Join ${familyName}`);
		if (outcome === 'cancelled') return;
		const failed = outcome === 'failed';
		this.copiedFamilyId = failed ? '' : familyId;
		this.copyFailedFamilyId = failed ? familyId : '';
	}

	/** Copy one rail code's join link and toast what happened. */
	async copyCode(origin: string, code: string): Promise<void> {
		const outcome = await this.copy(`${origin}/family/join/${code}`, 'Join this family');
		if (outcome === 'cancelled') return;
		const failed = outcome === 'failed';
		this.railCopiedCode = failed ? '' : code;
		this.railCopyFailedCode = failed ? code : '';
		this.toasts[failed ? 'error' : 'success'](
			failed
				? "Couldn't copy the join link — select it and copy it by hand."
				: 'Join link copied — send it to whoever you are inviting.'
		);
	}
}
