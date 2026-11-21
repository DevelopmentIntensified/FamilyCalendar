import { signupEmailAction } from '$lib/domains/access/index.server';

/** POST /signup/email `{email,firstName,lastName,redirectTo?}` — the sign-up link. */
export const POST = signupEmailAction.handler;
