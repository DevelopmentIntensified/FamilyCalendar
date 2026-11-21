/**
 * shell error rules: the three branches of `+error.svelte` — 404, any other
 * 4xx and everything else (5xx) — as copy, tone and the report-CTA flag.
 *
 * Issue 261: expected 4xx outcomes (no access, a bad link) used to claim "we
 * have been notified" and show the report CTA, because `handleError` never
 * runs for them. The split below is the fix; only the 5xx branch promises a
 * notification and offers the bug-form link. The `status` line and the
 * `<title>` stay in the component (one consumer).
 *
 * Doc: ./README.md#invariants
 */

const NOT_FOUND_TITLE = "We can't find that page";
const NOT_FOUND_BODY =
	'The link may be mistyped, or the page moved. Your calendar and tasks are safe.';
const CLIENT_ERROR_TITLE = "We can't open that";
const CLIENT_ERROR_FALLBACK = 'This page isn’t available to you.';
const SERVER_ERROR_TITLE = 'Something went wrong';
const SERVER_ERROR_BODY =
	"We've been notified automatically and will look into it. Your data is safe — try going back to your calendar.";

/**
 * The error card's view. `tone` picks the icon's treatment (slate for a miss,
 * amber for a refusal or a fault); `showReport` is true for 5xx only.
 * `message` is the server's 4xx reason (`$page.error?.message`): blank or
 * absent falls back to the generic sentence, and it is never shown for a 404
 * or a 5xx.
 */
export function shellErrorView(
	status: number,
	message?: string | null
): {
	readonly tone: 'muted' | 'warning';
	readonly title: string;
	readonly body: string;
	readonly showReport: boolean;
} {
	if (status === 404) {
		return { tone: 'muted', title: NOT_FOUND_TITLE, body: NOT_FOUND_BODY, showReport: false };
	}
	if (status >= 400 && status < 500) {
		return {
			tone: 'warning',
			title: CLIENT_ERROR_TITLE,
			body: message || CLIENT_ERROR_FALLBACK,
			showReport: false
		};
	}
	return {
		tone: 'warning',
		title: SERVER_ERROR_TITLE,
		body: SERVER_ERROR_BODY,
		showReport: true
	};
}
