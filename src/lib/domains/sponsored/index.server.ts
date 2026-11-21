/**
 * sponsored — public server interface: the serve and consent services, the
 * `/api/sponsored-events` handler, and the real `AdConsentPort` adapter
 * identity's settings save reads.
 *
 * `AdConsentPort` is declared by identity (rank 1) and implemented here
 * (rank 12): `src/lib/app/ports.server.ts` attaches the adapter to the ctx, so
 * identity never imports sponsored (rule R1). The adapter is built from the
 * ctx it is being attached to, so it reads the same database and clock as the
 * request — including a golden's transaction-scoped test db.
 *
 * The module declares no port of its own: the generation draw is seeded from
 * `sha256(userId + 'YYYY-MM')` (owner Q-041 B), so it needs no source of
 * randomness from the ctx.
 *
 * Doc: ./README.md#public-interface
 */
import type { AdConsentPort } from '$lib/domains/identity/index.server';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import {
	listSponsoredConsentHistory,
	recordSponsoredConsentChange
} from './sponsored.service.server';

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
