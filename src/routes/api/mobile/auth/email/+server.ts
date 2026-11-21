import { mobileEmailEndpoint } from '$lib/domains/access/index.server';

/** POST /api/mobile/auth/email — cookie-free code request for both intents. */
export const POST = mobileEmailEndpoint.handler;
