import { mobilePasswordEndpoint } from '$lib/domains/access/index.server';

/** POST /api/mobile/auth/password — the app's password door, minting an `fp_` token. */
export const POST = mobilePasswordEndpoint.handler;
