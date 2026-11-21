import { revokeApiTokenEndpoint } from '$lib/domains/identity/index.server';

/**
 * DELETE /api/me/api-tokens/{id} — revokes one of YOUR tokens, owner-scoped,
 * so another user's id deletes nothing and answers the same 200.
 */
export const DELETE = revokeApiTokenEndpoint.handler;
