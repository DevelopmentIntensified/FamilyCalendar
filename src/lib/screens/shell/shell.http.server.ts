/**
 * shell http: the two layout loads. There is no `/api` twin — shell owns no
 * `/api/**` route (its logout form posts identity's `/api/logout`), so this
 * module has no golden file and no S2 sha.
 *
 * `shellRootLoad` is the ONE app-chrome guard: a guest asking for a route that
 * renders the chrome gets 302 `/login` (`shellChromeForRoute`), which is the
 * legacy `(calendar)/calendar/+layout.server.ts:6-8` and
 * `(family)/+layout.server.ts:6-8` checks moved up, so the `(family)` group
 * needs no load of its own. It answers the session summary and the server year
 * with no query.
 *
 * `shellCalendarGroupLoad` replaces the legacy group load: identity's settings
 * ∥ family's id, then the roster (see `loadCalendarGroup`), plus the
 * Anonymous Account countdown. It reads no `url` and returns no `pathname`, so
 * it runs once per group entry. `depends('shell:scope')` is what the frame's
 * `invalidate('shell:scope')` re-runs after a time-zone save or a verify.
 *
 * Doc: ./README.md#public-interface
 */
import { redirect } from '@sveltejs/kit';
import { LOGIN_PATH, pageLoad } from '$lib/kernel/http/pageHandlers.server';
import type { ShellRootModel, ShellScopeModel } from './shell.contract';
import { shellChromeForRoute } from './shell.frame.rules';
import { shellDaysLeft } from './shell.notices.rules';
import { loadCalendarGroup, loadShellRoot } from './shell.service.server';

/**
 * The root load's data as the calendar group reads it. SvelteKit types
 * `event.parent()` as a loose record, so this is the shape boundary.
 */
type ShellRootParent = Partial<ShellRootModel>;

/** `load` for `src/routes/+layout.server.ts` (every route). */
export const shellRootLoad = pageLoad({
	auth: 'optional',
	handle: ({ ctx, actor, event }): ShellRootModel => {
		if (shellChromeForRoute(event.route.id) === 'app' && !actor) redirect(302, LOGIN_PATH);
		return loadShellRoot(ctx, actor, event.locals.user);
	}
});

/** `load` for `src/routes/(calendar)/calendar/+layout.server.ts`. */
export const shellCalendarGroupLoad = pageLoad({
	auth: 'user',
	handle: async ({ ctx, actor, event }): Promise<ShellScopeModel> => {
		const parent = (await event.parent()) as ShellRootParent;
		const scope = await loadCalendarGroup(ctx, actor);
		event.depends('shell:scope');
		const user = parent.user;
		// Defence in depth: auth 'user' already guarantees an actor, so a group
		// render without a summary is a broken session, not a 500.
		if (!user) redirect(302, LOGIN_PATH);
		return {
			user,
			year: parent.year ?? ctx.clock.now().getFullYear(),
			settings: scope.settings,
			familyId: scope.familyId,
			roster: [...scope.roster],
			daysLeft: shellDaysLeft(user.lastActiveAt, ctx.clock.now())
		};
	}
});
