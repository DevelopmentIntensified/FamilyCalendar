import type { RequestEvent } from '@sveltejs/kit';
import { POST as webResend } from '../../../../(marketing)/signup/password/resend/+server';

/**
 * POST /api/me/verify-email/resend (#292 G12) — the web's
 * /signup/password/resend handler itself: re-sends the verification code
 * to the caller's own email (idempotent once verified).
 */
export const POST = (event: RequestEvent): Promise<Response> =>
	// SAFETY: the web handler reads event.request + event.locals only.
	webResend(event as never);
