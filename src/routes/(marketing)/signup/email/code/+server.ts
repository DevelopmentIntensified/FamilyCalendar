import { signupCodeEndpoint } from '$lib/domains/access/index.server';

/** POST /signup/email/code `{code,email}` — 200 + session cookie, or the page's 500s (Q-064). */
export const POST = signupCodeEndpoint.handler;
