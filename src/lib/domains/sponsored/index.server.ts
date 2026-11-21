/**
 * sponsored — public server interface: the serve and consent services, the
 * `/api/sponsored-events` handler, the module's own `random` port, and the
 * real `AdConsentPort` adapter identity's settings save reads.
 *
 * `AdConsentPort` is declared by identity (rank 1) and implemented here
 * (rank 12): `src/lib/app/ports.server.ts` attaches the adapter to the ctx, so
 * identity never imports sponsored (rule R1). The adapter is built from the
 * ctx it is being attached to, so it reads the same database and clock as the
 * request — including a golden's transaction-scoped test db.
 *
 * `SponsoredPorts.random` is the module's one source of randomness (the
 * generation draw, Q-041 ported as today): the service takes it from the ctx
 * and tests pass a scripted source, because rule R5 keeps `Math.random()` out
 * of every file but `app` and `kernel`.
 *
 * Doc: ./README.md#public-interface
 */
import type { AdConsentPort, IdentityCtx } from '$lib/domains/identity/index.server';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import type { SponsoredRandomSource } from './sponsored.month.rules';
import {
	listSponsoredConsentHistory,
	recordSponsoredConsentChange
} from './sponsored.service.server';

/** What sponsored declares for itself: the generation draw's random source. */
export type SponsoredPorts = {
	/** A uniform draw in [0, 1); the app wires `Math.random`, tests script it. */
	readonly random: SponsoredRandomSource;
};

/** The ctx the serve service takes: identity's two ports (the settings view) plus ours. */
export type SponsoredCtx = IdentityCtx & SponsoredPorts;

/**
 * The real `AdConsentPort`: the consent trail beside `showAdsAsEvents` (#088).
 * Reading never writes; a write appends only on a real transition, on the
 * ctx's clock.
 */
export function sponsoredAdConsentPort(ctx: Ctx): AdConsentPort {
	return {
		listConsentHistory: (userId) => listSponsoredConsentHistory(ctx, userId),
		recordConsentChange: (userId, previous, next) =>
			recordSponsoredConsentChange(ctx, userId, { previous, next })
	};
}

export { listSponsoredEventsEndpoint } from './sponsored.http.server';
export {
	listSponsoredConsentHistory,
	listSponsoredEvents,
	pruneSponsoredEventsOlderThan,
	recordSponsoredConsentChange
} from './sponsored.service.server';
export type {
	SponsoredConsentRecord,
	SponsoredMonthRequest
} from './sponsored.service.server';
