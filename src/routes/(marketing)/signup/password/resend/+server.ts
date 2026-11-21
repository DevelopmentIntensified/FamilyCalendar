import { passwordResendAction } from '$lib/domains/access/index.server';

/** POST /signup/password/resend — re-sends the caller's own verification code. */
export const POST = passwordResendAction.handler;
