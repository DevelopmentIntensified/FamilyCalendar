/**
 * The one banner above the /account section.
 *
 * Legacy `+page.svelte:24-32` exactly: a success needs BOTH `success` and a
 * `message` (a create-token answer carries one), a failure reads `message` first
 * and `error` second (the kernel's auth refusal carries `error`), and a failure
 * with neither falls back to the approved sentence. The one extra field is
 * `guestNeedsClaim`, which makes the banner add the claim link (#242).
 *
 * Deliberately dependency-free: the shell renders this rule on every visit, so
 * it must not drag a domain module (and its zod contract) into the initial
 * client bundle. The Dashboard form rules live with the Dashboard section
 * (`account.dashboard.rules.ts`), which loads lazily.
 *
 * Pure (rule R4/R5): a payload in, a value out.
 *
 * Doc: ./README.md#invariants
 */

/** What an action's `form` may carry; every key optional, one union per page. */
export type AccountActionForm = {
	readonly success?: boolean;
	readonly message?: string;
	readonly error?: string;
	readonly guestNeedsClaim?: boolean;
	readonly apiToken?: string;
	readonly apiTokenName?: string;
};

/** The banner the page shows above the mounted section. */
export type AccountBanner =
	| { readonly kind: 'success'; readonly message: string; readonly guestNeedsClaim: false }
	| { readonly kind: 'error'; readonly message: string; readonly guestNeedsClaim: boolean }
	| null;

/** The approved fallback when a failure names neither a message nor an error. */
export const ACCOUNT_BANNER_FALLBACK = 'Something went wrong. Please try again.';

/**
 * Success beats failure (legacy `{#if success && message} … {:else if form &&
 * !form.success}`): an action may answer `success: true` and still be read as
 * one green banner, and a `success` without a message shows nothing at all.
 */
export function accountBanner(form: AccountActionForm | null | undefined): AccountBanner {
	if (!form) return null;
	const message = form.message ?? form.error;
	if (form.success && message) {
		return { kind: 'success', message, guestNeedsClaim: false };
	}
	if (!form.success) {
		return {
			kind: 'error',
			message: message ?? ACCOUNT_BANNER_FALLBACK,
			guestNeedsClaim: form.guestNeedsClaim === true
		};
	}
	return null;
}
