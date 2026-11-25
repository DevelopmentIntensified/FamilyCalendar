/**
 * calendar pages http: the three calendar-owned page loads — the event detail
 * (`/calendar/event/[id]`), the importer (`/calendar/import`) and the fridge
 * sheet (`/calendar/print`).
 *
 * Each loader is one service call, so the page and its `/api` twin cannot
 * disagree: `getEventForViewer` answers the detail page exactly as it answers
 * any viewer-scoped read, and `getPrintMonth`/`listImportTargets` are the same
 * functions `/api/print` and `/api/import` serve.
 *
 * Auth levels are the legacy routes' own: the detail and print pages redirect a
 * signed-out visitor to `/login` (kernel `pageLoad`, never a 401), while the
 * importer's legacy load answered `{ calendars: [] }` and kept the page, so it
 * stays `optional` and never redirects.
 *
 * Doc: ./README.md#invariants
 */
import { error, isHttpError, isRedirect } from '@sveltejs/kit';
import { isAppError } from '$lib/kernel/errors/appError';
import { pageLoad } from '$lib/kernel/http/pageHandlers.server';
import { getPrintMonth, type CalendarPrintMonth } from './calendar.calendars.service.server';
import {
	getEventForViewer,
	type CalendarEventDetail
} from './calendar.events.service.server';
import { listImportTargets } from './calendar.ics.service.server';
import type { CalendarImportTargetsResponse } from './calendar.contract';

/** The `(calendar)` group layout's data as this page reads it (`parent()`). */
type CalendarLayoutData = {
	readonly settings?: { readonly timeZone?: string | null } | null;
};

/**
 * `/calendar/event/[id]`'s model: the viewer-scoped event read plus the two
 * display facts the page needs (whether the calendar is the family's, and the
 * zone its times are written in).
 */
export type CalendarEventDetailPageData = CalendarEventDetail & {
	readonly isFamilyEvent: boolean;
	readonly timeZone: string | null;
};

/** A service `AppError` becomes the page's legacy status and message. */
function pageError(cause: unknown): never {
	if (isRedirect(cause) || isHttpError(cause)) throw cause;
	if (isAppError(cause)) error(cause.status, cause.message);
	throw cause;
}

/**
 * `GET /calendar/event/[id]` — missing event → 404 `Event not found`, neither
 * owner nor calendar access → 403 `No access to this event` (the service's
 * messages; legacy's own copy).
 */
export const calendarEventDetailPage = pageLoad({
	auth: 'user',
	handle: async ({ ctx, actor, event }): Promise<CalendarEventDetailPageData> => {
		let detail: CalendarEventDetail;
		try {
			detail = await getEventForViewer(ctx, actor, event.params.id ?? '');
		} catch (cause) {
			pageError(cause);
		}
		const parent = (await event.parent()) as CalendarLayoutData;
		return {
			...detail,
			isFamilyEvent: !!detail.calendar?.familyId,
			timeZone: parent.settings?.timeZone ?? null
		};
	}
});

/**
 * `GET /calendar/import` — the calendars a viewer may import into. Legacy read
 * the list on every load and answered an empty list when signed out rather
 * than redirecting, so this page keeps `optional`.
 */
export const calendarImportPage = pageLoad({
	auth: 'optional',
	handle: async ({ ctx, actor }): Promise<CalendarImportTargetsResponse> => {
		if (!actor) return { calendars: [] };
		return await listImportTargets(ctx, actor);
	}
});

/** `GET /calendar/print` — the printed month, signed-out → 302 `/login`. */
export const calendarPrintPage = pageLoad({
	auth: 'user',
	handle: async ({ ctx, actor, event }): Promise<CalendarPrintMonth> =>
		await getPrintMonth(ctx, actor, {
			year: event.url.searchParams.get('year'),
			month: event.url.searchParams.get('month')
		})
});
