import { signupCallback } from '$lib/domains/access/index.server';

/** GET /signup/email/callback?token — 302 with the session cookie and the signed landing. */
export const GET = signupCallback.handler;
