import { json, type RequestEvent } from '@sveltejs/kit';
import { clientKey, rateLimit } from '$lib/server/utils/rateLimit';
import { POST as webReset } from '../../../../(marketing)/forgot-password/reset/+server';

/**
 * Reset attempts per IP / window. The web handler has no throttle of its own
 * (the reset call comes from a page the emailed token already opened); a
 * Bearer-less API route does need one, so it is added here rather than in the
 * shared handler. Mirrors the forgot-password window.
 */
export const RESET_RATE_LIMIT = { limit: 10, windowMs: 15 * 60 * 1000 };

/**
 * POST /api/mobile/auth/reset `{token, password}` (#292 G12) — the web's
 * /forgot-password/reset handler itself: `token` is the JWT from the
 * emailed link (`/forgot-password/reset?token=…`), single-use, 60 minutes.
 * Signs out every web session AND revokes every fp_ API token on success,
 * as the web does (#292 L0 follow-up).
 */
export const POST = async (event: RequestEvent): Promise<Response> => {
	if (
		!rateLimit(
			clientKey(event.request, 'pw-reset-ip'),
			RESET_RATE_LIMIT.limit,
			RESET_RATE_LIMIT.windowMs
		)
	) {
		return json({ error: 'Too many attempts. Try again shortly.' }, { status: 429 });
	}
	// SAFETY: the web handler reads event.request only.
	return webReset(event as never);
};
