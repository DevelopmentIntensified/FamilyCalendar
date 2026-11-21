/**
 * calendarPage http: the two page loads this screen owns, and nothing else.
 *
 * - `calendarPageLoad` — `GET /calendar` (auth `user`: no session → 302
 *   `/login`). It resolves the URL rules first (the #056 Dashboard redirect,
 *   then the deep-link seeds), runs the legacy guest-merge gate, and hands the
 *   group layout's facts plus the seeds to `getCalendarPage`.
 * - `shareTargetLoad` — `GET /share-target`, the PWA share target: 0 queries,
 *   one 302 into `/calendar?quickadd=…`.
 *
 * There are no form actions: every write (Event create/edit/delete, bulk,
 * phrase report, task create) goes through its domain's `/api` route.
 *
 * Auth levels match legacy exactly: the page answered `!event.locals.user →
 * /login`, and `/share-target` redirected whoever arrived, signed in or not.
 *
 * Doc: ./README.md#public-interface
 */
import { redirect, type ServerLoadEvent } from '@sveltejs/kit';
import type { Actor } from '$lib/kernel/ctx/actor';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import { pageLoad } from '$lib/kernel/http/pageHandlers.server';
import { GUEST_MERGE_COOKIE, isClaimableGuest } from '$lib/domains/access/index.server';
import { isRegisteredAccount } from '$lib/domains/identity';
import type {
	CalendarPageModel,
	CalendarPageRosterMember,
	CalendarPageSeeds,
	CalendarPageSettings
} from './calendarPage.contract';
import { getCalendarPage } from './calendarPage.service.server';
import { createSeedFromUrl, dashboardRedirect, parseCalendarUrl, shareTargetText } from './calendarPage.url.rules';

/**
 * The `(calendar)` group layout's facts, read structurally: the shell screen
 * owns that layout (`ShellScopeModel`), and rule R2 forbids one screen
 * importing another. Every field degrades to its own fallback, as legacy's
 * reads did.
 */
type CalendarPageParentScope = {
	settings?: {
		weekStart?: string | null;
		timeZone?: string | null;
		color?: string | null;
		defaultView?: string | null;
		defaultCalendarId?: string | null;
		showAdsAsEvents?: boolean | null;
	} | null;
	roster?: readonly { userId: string; firstName: string; lastName: string | null }[];
};

/** The settings facts the first render is composed from, with legacy defaults. */
function settingsOf(scope: CalendarPageParentScope): CalendarPageSettings {
	return {
		weekStart: scope.settings?.weekStart ?? 'sunday',
		defaultView: scope.settings?.defaultView ?? 'monthView',
		timeZone: scope.settings?.timeZone ?? 'UTC',
		color: scope.settings?.color ?? null,
		showAdsAsEvents: scope.settings?.showAdsAsEvents === true,
		defaultCalendarId: scope.settings?.defaultCalendarId ?? null
	};
}

/**
 * The legacy guest-merge gate (`+page.server.ts:49-66`): only a REGISTERED
 * account with a stash naming a still-claimable Anonymous Account is sent to
 * `/merge-guest` (#241: a guest's placeholder email is non-null since #196, so
 * "registered" is identity's predicate, never email truthiness). A stash that
 * names nobody claimable is dropped; a failed check degrades to "no merge".
 */
async function guestMergeGate(ctx: Ctx, event: ServerLoadEvent, actor: Actor): Promise<void> {
	const stash = event.cookies.get(GUEST_MERGE_COOKIE);
	if (!stash || !isRegisteredAccount(actor) || stash === actor.id) return;
	let claimable = false;
	try {
		claimable = await isClaimableGuest(ctx, stash);
	} catch (error) {
		ctx.log.warn('calendar_page_merge_check_failed', {
			message: error instanceof Error ? error.message : String(error)
		});
	}
	if (claimable) throw redirect(302, '/merge-guest');
	event.cookies.delete(GUEST_MERGE_COOKIE, { path: '/' });
}

/**
 * `GET /calendar` — the page load. The URL rules run before any read: the
 * Dashboard redirect is a 302 on its own, and an invalid `?date=`/`?view=` is
 * ignored param-by-param (the schema decides), never a 400.
 */
export const calendarPageLoad = pageLoad({
	auth: 'user',
	handle: async ({ ctx, actor, event }): Promise<CalendarPageModel> => {
		const search = event.url.searchParams;
		const scope = (await event.parent()) as unknown as CalendarPageParentScope;
		const settings = settingsOf(scope);

		const dashboard = dashboardRedirect(search, settings.defaultView);
		if (dashboard) throw redirect(302, dashboard);

		await guestMergeGate(ctx, event, actor);

		const url = parseCalendarUrl(search);
		const seeds: CalendarPageSeeds = {
			date: url.date,
			view: url.view,
			edit: url.edit,
			create: createSeedFromUrl(search)
		};
		const roster: CalendarPageRosterMember[] = (scope.roster ?? []).map((member) => ({
			userId: member.userId,
			firstName: member.firstName,
			lastName: member.lastName
		}));

		return await getCalendarPage(ctx, actor, { settings, roster, seeds });
	}
});

/**
 * `GET /share-target` — the PWA share target's GET action lands here with
 * `title`/`text`/`url`; the rule folds them into one Quick Add line (no URL
 * duplicated when Android already embedded it in the text, issue 027) and the
 * 302 puts the person on their calendar with the modal seeded.
 */
export const shareTargetLoad = pageLoad({
	auth: 'optional',
	handle: ({ event }): never => {
		const search = event.url.searchParams;
		const shared = shareTargetText(
			search.get('title') ?? '',
			search.get('text') ?? '',
			search.get('url') ?? ''
		);
		throw redirect(302, `/calendar?quickadd=${encodeURIComponent(shared)}`);
	}
});
