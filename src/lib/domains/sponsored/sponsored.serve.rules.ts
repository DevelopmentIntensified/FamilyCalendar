/**
 * sponsored serve rules: the one serve gate (#088).
 *
 * The gate is one field on the settings row: `showAdsAsEvents === true`. No
 * row, `null` and `false` all mean no Sponsored Events, no other field can
 * grant consent, and the consent trail is never read (`adService.ts:77-82`).
 *
 * Nothing else decides what is served (owner Q-040 B): a user-typed 📢 Event
 * is not ad inventory, so the legacy own-row read and its title test are gone
 * and the generated month is the sole source.
 *
 * Doc: ./README.md#invariants
 */

/** The one settings field the gate reads; a row may carry any other field. */
export type SponsoredServeSettings = { readonly showAdsAsEvents?: boolean | null };

/** The serve gate: Sponsored Events only when the flag is exactly `true`. */
export function shouldServeSponsoredEvents(
	settings: SponsoredServeSettings | null | undefined
): boolean {
	return settings?.showAdsAsEvents === true;
}
