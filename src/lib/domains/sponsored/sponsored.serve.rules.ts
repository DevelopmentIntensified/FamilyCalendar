/**
 * sponsored serve rules: the one serve gate (#088) and the 📢 title rule that
 * makes an own Event a Sponsored Event.
 *
 * The gate is one field on the settings row: `showAdsAsEvents === true`. No
 * row, `null` and `false` all mean no Sponsored Events, no other field can
 * grant consent, and the consent trail is never read (`adService.ts:77-82`).
 *
 * The title rule is today's behaviour, ported as is (Q-040 ports as today; its
 * decided fix B — a user-typed 📢 Event is not ad inventory — lands after S6
 * and deletes `isSponsoredTitle`, `sponsoredMessageOf`, the own-row read and
 * the `events` foreign read together).
 *
 * Doc: ./README.md#invariants
 */

/** The marker an own Event's title starts with to be served as a Sponsored Event. */
export const SPONSORED_TITLE_MARKER = '📢';

/** The one settings field the gate reads; a row may carry any other field. */
export type SponsoredServeSettings = { readonly showAdsAsEvents?: boolean | null };

/** The serve gate: Sponsored Events only when the flag is exactly `true`. */
export function shouldServeSponsoredEvents(
	settings: SponsoredServeSettings | null | undefined
): boolean {
	return settings?.showAdsAsEvents === true;
}

/**
 * Whether an own Event is a Sponsored Event: its title starts with the marker
 * (the legacy `title LIKE '📢%'`, `adService.ts:103`; the repo filters with
 * the same marker).
 */
export function isSponsoredTitle(title: string): boolean {
	return title.startsWith(SPONSORED_TITLE_MARKER);
}

/**
 * The served message of a 📢 title: the first marker removed, then the
 * whitespace on both ends (`adService.ts:111`), so `📢    Extra spaces` serves
 * as `Extra spaces` and a second marker stays.
 */
export function sponsoredMessageOf(title: string): string {
	return title.replace(SPONSORED_TITLE_MARKER, '').trim();
}
