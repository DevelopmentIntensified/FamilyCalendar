/**
 * family add-member rules: the `/family/[familyId]/members/add` page's pure
 * logic — the three tabs, the success panel's copy, and the one failure ladder
 * every door shares.
 *
 * The ladder is the behaviour issue 250 pinned: a handled refusal answers
 * `{ error }`, a thrown server error reaches the browser as SvelteKit's
 * `{ message }` with a non-2xx status, and neither may read as success. Anything
 * else non-2xx is the page's own sentence.
 *
 * Doc: ./README.md#invariants
 */
import { canManageInvites } from './family.roles.rules';

/** The three ways in, in the approved tab order. "Invite by email" hides for a plain member. */
export const FAMILY_ADD_TABS = ['search', 'invite', 'child'] as const;

export type FamilyAddTab = (typeof FAMILY_ADD_TABS)[number];

/** Whether the invite tab shows: creator/admin only, the same gate the door enforces. */
export function familyCanInviteByEmail(role: string | null | undefined): boolean {
	return canManageInvites(role);
}

/** The tabs a caller may see, in order. */
export function familyVisibleAddTabs(canInviteByEmail: boolean): FamilyAddTab[] {
	return FAMILY_ADD_TABS.filter((tab) => tab !== 'invite' || canInviteByEmail);
}

/**
 * What an add-member response refuses with, or `null` when it succeeded. A
 * success body carries door-specific keys (`{ users }` from a search), so the
 * parameter admits anything and only `error`/`message` are read.
 */
export function familyAddFailure(
	ok: boolean,
	payload:
		| { readonly error?: unknown; readonly message?: unknown; readonly [key: string]: unknown }
		| null
		| undefined
): string | null {
	if (payload?.error) return String(payload.error);
	if (!ok) {
		return typeof payload?.message === 'string' && payload.message
			? payload.message
			: 'Something went wrong. Please try again.';
	}
	return null;
}

/** The success panel: an emailed invite has added nobody yet (issue 249). */
export function familyAddSuccessCopy(invitedEmail: string | null): {
	readonly heading: string;
	readonly body: string;
} {
	if (invitedEmail) {
		return {
			heading: 'Invite sent',
			body: `Invite sent to ${invitedEmail} — they join when they open it (expires in 24h).`
		};
	}
	return { heading: 'Member Added!', body: 'The new member has been added to your family.' };
}

/** A search that never reached the server, in the page's words. */
export const FAMILY_ADD_NETWORK_FAILURE = 'Network problem. Please try again.';
