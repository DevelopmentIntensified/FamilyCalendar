/**
 * billing http: the plan card's one `/api` route.
 *
 * `GET /api/me/subscription` answers a signed-in caller (session or `fp_`
 * Bearer token) with the summary the golden pins; a read failure still answers
 * 200 with the free defaults. No body, no query, no rate limit — the route
 * only reads.
 *
 * Doc: ./README.md#invariants
 */
import { endpoint, ok } from '$lib/kernel/http/endpoint.server';
import { getSubscriptionSummary } from './billing.service.server';

export const getSubscriptionEndpoint = endpoint({
	auth: 'user',
	handle: async ({ ctx, actor }) => ok(await getSubscriptionSummary(ctx, actor))
});
