import { json, type RequestEvent } from '@sveltejs/kit';
import { POST as webForgot } from '../../../../(marketing)/forgot-password/+server';

/**
 * POST /api/mobile/auth/forgot `{email}` (#292 G12) — the web's
 * /forgot-password handler itself (same throttle, same uniform answer: an
 * unknown or guest email gets the success shape, #245). The email carries
 * the web reset link `/forgot-password/reset?token=…`; the app completes it
 * with POST /api/mobile/auth/reset.
 */
export const POST = async (event: RequestEvent): Promise<Response> => {
	// SAFETY: the web handler reads event.request only.
	const res = await webForgot(event as never);
	if (res.status !== 200) return res;
	return json({ sent: true });
};
