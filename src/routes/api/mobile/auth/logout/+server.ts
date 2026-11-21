import { mobileLogoutEndpoint } from '$lib/domains/access/index.server';

/** POST /api/mobile/auth/logout — revokes exactly the presented `fp_` token. */
export const POST = mobileLogoutEndpoint.handler;
