import { loginEmailAction } from '$lib/domains/access/index.server';

/** POST /login/email `{email,redirectTo?}` — the emailed sign-in link. */
export const POST = loginEmailAction.handler;
