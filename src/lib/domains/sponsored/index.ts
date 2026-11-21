/**
 * sponsored — public isomorphic interface: contract types, pure rules, client api.
 * Other modules import sponsored ONLY through this file, index.server.ts or ui/index.ts (rule R2).
 * Doc: ./README.md#public-interface
 */
export type {
	SponsoredConsentDecision,
	SponsoredEvent,
	SponsoredEventsQuery,
	SponsoredEventsResponse
} from './sponsored.contract';
export { shouldServeSponsoredEvents } from './sponsored.serve.rules';
export { SPONSORED_EVENT_COLOR } from './sponsored.display.rules';
