import { loginCallback } from '$lib/domains/access/index.server';

/** GET /login/email/callback?token — 302 to the signed target with the session cookie. */
export const GET = loginCallback.handler;
