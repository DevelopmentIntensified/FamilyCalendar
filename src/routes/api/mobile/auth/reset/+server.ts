import { mobileResetEndpoint } from '$lib/domains/access/index.server';

/** POST /api/mobile/auth/reset `{token,password}` — the shared reset, under its IP cap. */
export const POST = mobileResetEndpoint.handler;
