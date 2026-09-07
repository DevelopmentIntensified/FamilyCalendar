/**
 * Issue 027 — PWA share target.
 *
 * The manifest share_target GET action lands on /calendar with `title`,
 * `text` and `url` search params. Research fact: on Android the `url`
 * param is always empty — shared URLs arrive embedded inside `text`
 * (sometimes `title`), so the builder must never duplicate a URL that is
 * already in the text blob.
 *
 * The result seeds the Quick Add (NLP) input on the create-event modal,
 * where the user can review and edit it before the normal parse runs.
 */
export function buildSharedTargetText(title: string, text: string, url: string): string {
	const t = text.trim();
	const u = url.trim();
	// Prefer the text blob; fall back to the title when text is empty.
	let base = t || title.trim();
	// Only append the url param when it isn't already inside the text
	// (Android embeds it; desktop/iOS may deliver it as its own param).
	// Compare raw (untrimmed) text so a URL glued to punctuation still matches.
	if (u && !(text ?? '').includes(u)) {
		base = base ? `${base} ${u}` : u;
	}
	// The Quick Add field is a single-line input: collapse newlines from
	// long shared messages into spaces.
	return base.replace(/\s+/g, ' ').trim();
}
