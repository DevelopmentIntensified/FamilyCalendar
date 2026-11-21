import { mobileGuestEndpoint } from '$lib/domains/access/index.server';

/** POST /api/mobile/auth/guest — an Anonymous Account and its token; empty body allowed. */
export const POST = mobileGuestEndpoint.handler;
