/**
 * calendarPage URL rules: what the page reads from its query string, the
 * Dashboard redirect, the PWA share-target text and the `?edit=` deep-link
 * resolution.
 *
 * Pure: the caller hands the search params in (a `URLSearchParams`, as SvelteKit
 * gives the page load) and owns navigation. Nothing here reads the clock, the
 * environment or storage (R4/R5).
 *
 * Ported from legacy `+page.svelte:89-107,333-356,506-521` and
 * `src/routes/share-target/+page.server.ts:5-11`.
 *
 * Doc: ./README.md#entry-url-and-the-opening-view
 */
import {
	calendarSearchParamsSchema,
	type CalendarCreateSeed,
	type CalendarSearchParams
} from './calendarPage.contract';
import type { CalendarView } from './calendarPage.view.rules';

/**
 * What `?date=`/`?view=`/`?edit=`/`?quickadd=`/the share-target params say.
 * Every field is independently optional: an invalid param is ignored, never
 * half-applied (a bad `?date=` must not stop a good `?view=`).
 */
export interface CalendarUrl {
	/** A real `YYYY-MM-DD`, else null. */
	date: string | null;
	/** One of the four views, else null. */
	view: CalendarView | null;
	/** The Event (or recurring master) a notification links to, else null. */
	edit: string | null;
	/** The Quick Add seed text, else null. */
	quickadd: string | null;
	/** Presence only — any value is the escape hatch (#056). */
	dashboardView: boolean;
	/** PWA share-target params, raw; `createSeedFromUrl` folds them. */
	title: string | null;
	text: string | null;
	url: string | null;
}

/**
 * Read the page's params. The contract decides which values are usable; a
 * rejected value is absent, which is why one junk param cannot take a good
 * neighbour down with it.
 */
export function parseCalendarUrl(search: URLSearchParams): CalendarUrl {
	// `.get` (first value), as legacy read them: a repeated `?date=` cannot
	// silently switch the page to the last one.
	const parsed = calendarSearchParamsSchema.safeParse({
		date: search.get('date') ?? undefined,
		view: search.get('view') ?? undefined,
		quickadd: search.get('quickadd') ?? undefined,
		title: search.get('title') ?? undefined,
		text: search.get('text') ?? undefined,
		url: search.get('url') ?? undefined,
		edit: search.get('edit') ?? undefined,
		dashboardView: search.get('dashboardView') ?? undefined
	});
	const params: Partial<CalendarSearchParams> = parsed.success ? parsed.data : {};
	return {
		date: params.date ?? null,
		view: params.view ?? null,
		edit: params.edit ? params.edit : null,
		quickadd: params.quickadd && params.quickadd.trim().length > 0 ? params.quickadd : null,
		dashboardView: search.has('dashboardView'),
		title: params.title ?? null,
		text: params.text ?? null,
		url: params.url ?? null
	};
}

/**
 * Opt-in landing: with Default View set to "Dashboard", `/calendar` sends the
 * person to the Day Dashboard. `?dashboardView` is the escape hatch the
 * dashboard's "Back to Calendar" link uses (#056), and `?view=`/`?date=` also
 * bypass the redirect so a deep link works.
 *
 * Presence, not validity, is what bypasses: today a `?view=bogus` link still
 * reaches the calendar page, and the invalid view is simply ignored there.
 * Returns the redirect target, or null to render the calendar.
 */
export function dashboardRedirect(
	search: URLSearchParams,
	defaultView: string | null | undefined
): '/calendar/dashboard' | null {
	const hasViewParams = search.has('view') || search.has('date');
	if (defaultView === 'dashboard' && !search.has('dashboardView') && !hasViewParams) {
		return '/calendar/dashboard';
	}
	return null;
}

/**
 * Issue 027 — the PWA share target's GET params (`title`, `text`, `url`).
 * On Android the `url` param is always empty; shared URLs arrive embedded in
 * `text` (sometimes `title`), so the builder must never duplicate a URL that is
 * already in the text blob. Compare raw (untrimmed) text so a URL glued to
 * punctuation still matches. Collapse newlines: Quick Add is one line.
 */
export function shareTargetText(title: string, text: string, url: string): string {
	const trimmedText = text.trim();
	const trimmedUrl = url.trim();
	let base = trimmedText || title.trim();
	if (trimmedUrl && !(text ?? '').includes(trimmedUrl)) {
		base = base ? `${base} ${trimmedUrl}` : trimmedUrl;
	}
	return base.replace(/\s+/g, ' ').trim();
}

/** The note above the create modal after a consumed share/quick-add seed. */
export const CALENDAR_SHARED_TEXT_NOTE = 'Shared text loaded — review and add.';

/**
 * The create modal's deep-link seed: the folded share-target text, else
 * `?quickadd=`. Null when neither carries anything — the URL seed is consumed
 * once by the caller (`+page.svelte:333-356`).
 */
export function createSeedFromUrl(search: URLSearchParams): CalendarCreateSeed | null {
	const { quickadd, title, text, url } = parseCalendarUrl(search);
	const shared = shareTargetText(title ?? '', text ?? '', url ?? '') || (quickadd ?? '').trim();
	if (!shared) return null;
	return { quickAdd: shared, note: CALENDAR_SHARED_TEXT_NOTE };
}

/** The two lines of copy `?edit=` uses when the id matches nothing loaded. */
export const CALENDAR_EDIT_NOT_FOUND =
	"Event not found — it may have been deleted, or you don't have access to it.";

export interface CalendarEditableRow {
	id: string;
	/** A recurring occurrence carries the master's id too; a link may name either. */
	masterId?: string | null;
}

/**
 * `?edit=<id>` resolves to a row by its own id or by its recurring master's id
 * and nothing else. Searches the rows the page already holds, so an id outside
 * the loaded month window does not resolve — today's behaviour, kept for this
 * port (Q-100): the banner is the answer, not a one-Event read.
 */
export function resolveCalendarEditLink<T extends CalendarEditableRow>(
	editId: string | null | undefined,
	rows: readonly T[]
): T | null {
	if (!editId) return null;
	const found = rows.find((row) => row.id === editId || row.masterId === editId);
	return found ?? null;
}
