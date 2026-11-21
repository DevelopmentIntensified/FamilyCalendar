import { verifyEmailEndpoint } from '$lib/domains/access/index.server';

/** POST /api/me/verify-email `{code}` — verifies the caller's OWN address. */
export const POST = verifyEmailEndpoint.handler;
