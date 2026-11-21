/**
 * The /account forms' pure part: the one banner above the section, and the
 * show-based Dashboard Module form.
 *
 * The banner rule is legacy `+page.svelte:24-32` exactly: a success needs BOTH
 * `success` and a `message` (a create-token answer carries one), a failure
 * reads `message` first and `error` second (the kernel's auth refusal carries
 * `error`), and a failure with neither falls back to the approved sentence. The
 * one extra field is `guestNeedsClaim`, which makes the banner add the claim
 * link (#242).
 *
 * The module form is 105: an unchecked checkbox is ABSENT from the payload, so
 * "absent" is how a module is hidden; only canonical ids survive, so a form
 * carrying a retired id cannot grow the saved list.
 *
 * Pure (rule R4/R5): a payload in, a value out.
 *
 * Doc: ./README.md#invariants
 */
import { DASHBOARD_MODULES } from '$lib/domains/dashboardModules';

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

/**
 * Show-based form in, hidden list out: every checkbox named `module_<id>` that
 * is not `'on'` is hidden, and the list is the registry's own order — so the
 * stored list is a pure function of which canonical ids were named.
 */
export function accountHiddenModulesFromForm(form: FormData): string[] {
	return DASHBOARD_MODULES.map((module) => module.id).filter(
		(id) => form.get(`module_${id}`) !== 'on'
	);
}

/**
 * The saved hidden list as a per-module visibility map. A saved id the registry
 * no longer carries hides nothing (103): absent is visible.
 */
export function accountModuleVisibility(
	hidden: readonly string[] | null | undefined
): Record<string, boolean> {
	const hiddenSet = new Set(hidden ?? []);
	return Object.fromEntries(DASHBOARD_MODULES.map(({ id }) => [id, !hiddenSet.has(id)]));
}
