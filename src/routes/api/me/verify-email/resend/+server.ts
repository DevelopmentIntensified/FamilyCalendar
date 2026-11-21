import { resendVerificationEndpoint } from '$lib/domains/access/index.server';

/** POST /api/me/verify-email/resend — re-sends the verification code; never reads a body. */
export const POST = resendVerificationEndpoint.handler;
