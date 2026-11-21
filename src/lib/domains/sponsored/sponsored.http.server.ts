/**
 * sponsored http: the one `/api` handler, `GET /api/sponsored-events`.
 *
 * Reproduces the legacy wire exactly (`+server.ts:13-35`): signed in (401
 * `Unauthorized`), strict `month` (400 `Invalid month`), `200 {events}`.
 * `calendarPage`'s ad leg calls the service directly, so no page load lives
 * here.
 *
 * The request instant: the wire's absent `month` means "the current month in
 * the user's zone", read once here as `ctx.clock.now()` — the same clock every
 * other rule input takes (R5). A golden gets the real `systemClock` as its
 * `ctx.clock`, so the frozen absent-month row still resolves against the real
 * current month; a service test pins `now` explicitly.
 *
 * Doc: ./README.md#public-interface
 */
import type { IdentityCtx } from '$lib/domains/identity/index.server';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import { endpoint, ok } from '$lib/kernel/http/endpoint.server';
import { SponsoredEventsQuery, type SponsoredEventsResponse } from './sponsored.contract';
import { listSponsoredEvents } from './sponsored.service.server';

/**
 * `GET /api/sponsored-events?month=YYYY-MM`: the month's Sponsored Events,
 * `{events: []}` when the serve gate is off. An absent month is the current
 * month in the user's zone (settings zone, else `UTC`).
 */
export const listSponsoredEventsEndpoint = endpoint({
	auth: 'user',
	query: SponsoredEventsQuery,
	handle: async ({ ctx, actor, query }) => {
		const events = await listSponsoredEvents(identityCtx(ctx), actor, {
			month: query.month,
			now: ctx.clock.now()
		});
		const response: SponsoredEventsResponse = { events };
		return ok(response);
	}
});

/**
 * The endpoint builder types `ctx` as the kernel `Ctx`; the app attaches
 * identity's two ports to every ctx (`src/lib/app/ports.server.ts`). Fails
 * loudly when the wiring is missing rather than reading through `undefined`.
 */
function identityCtx(ctx: Ctx): IdentityCtx {
	if (!('calendarAccess' in ctx) || !('adConsent' in ctx)) {
		throw new Error(
			'sponsored ports are not wired: src/lib/app/ports.server.ts must attach calendarAccess and adConsent'
		);
	}
	return ctx as IdentityCtx;
}
