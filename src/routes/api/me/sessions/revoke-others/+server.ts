import { revokeOtherSessionsEndpoint } from '$lib/domains/identity/index.server';

/**
 * POST /api/me/sessions/revoke-others — every web session except the caller's
 * own cookie session (a Bearer caller has none, so all web sessions go).
 */
export const POST = revokeOtherSessionsEndpoint.handler;
