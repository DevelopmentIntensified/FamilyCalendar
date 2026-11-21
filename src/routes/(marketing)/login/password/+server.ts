import { loginPasswordAction } from '$lib/domains/access/index.server';

/** POST /login/password `{email,password}` — 200 `{success,user}` + session cookie. */
export const POST = loginPasswordAction.handler;
