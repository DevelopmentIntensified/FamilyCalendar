import { mobileSignupEndpoint } from '$lib/domains/access/index.server';

/** POST /api/mobile/auth/signup — 200 pending (same shape for a taken address), `fp_` token. */
export const POST = mobileSignupEndpoint.handler;
