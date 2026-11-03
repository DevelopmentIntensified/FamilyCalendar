import type { RequestEvent } from '@sveltejs/kit';
import { POST as webReset } from '../../../../(marketing)/forgot-password/reset/+server';

/**
 * POST /api/mobile/auth/reset `{token, password}` (#292 G12) — the web's
 * /forgot-password/reset handler itself: `token` is the JWT from the
 * emailed link (`/forgot-password/reset?token=…`), single-use, 60 minutes.
 * Signs out every web session on success, as the web does.
 */
export const POST = (event: RequestEvent): Promise<Response> =>
	// SAFETY: the web handler reads event.request only.
	webReset(event as never);
