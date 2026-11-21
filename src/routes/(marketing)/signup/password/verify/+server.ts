import { passwordVerifyAction } from '$lib/domains/access/index.server';

/** POST /signup/password/verify `{code,email}` — flips `emailVerified` for that `password-signup` row. */
export const POST = passwordVerifyAction.handler;
