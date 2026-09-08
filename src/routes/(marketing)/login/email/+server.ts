import type { RequestEvent } from '@sveltejs/kit';
import { clientKey, rateLimit } from '$lib/server/utils/rateLimit';
import {
	issueMagicLink,
	magicLinkDeps,
	MAGIC_LINK_RATE_LIMIT,
	type MagicLinkDeps,
	type MagicLinkGate
} from '$lib/server/services/magicLink';

export type LoginEmailDeps = MagicLinkDeps & { gate?: MagicLinkGate };

const GENERIC_SUCCESS = {
	success: true,
	message: "If that email has an account, we've sent a login link."
};

export const POST = async (
	event: RequestEvent,
	deps: LoginEmailDeps = magicLinkDeps
): Promise<Response> => {
	const data = await event.request.json();

	const gate: MagicLinkGate =
		deps.gate ??
		((key) =>
			rateLimit(
				clientKey(event.request, key),
				MAGIC_LINK_RATE_LIMIT.limit,
				MAGIC_LINK_RATE_LIMIT.windowMs
			));

	const result = await issueMagicLink(deps, 'login', { email: data.email }, gate);

	switch (result.status) {
		case 'sent':
		// Same response as the known-email path (without sending anything)
		// so this endpoint cannot be used to enumerate registered accounts.
		case 'suppressed':
			return new Response(JSON.stringify(GENERIC_SUCCESS), { status: 200 });
		case 'rejected':
			switch (result.reason) {
				case 'invalid-email':
					return new Response(JSON.stringify({ success: false, error: 'Invalid email' }), {
						status: 400
					});
				case 'rate-limited':
					return new Response(
						JSON.stringify({ success: false, error: 'Too many attempts. Try again shortly.' }),
						{ status: 429 }
					);
				case 'send-failed':
					return new Response(
						JSON.stringify({ success: false, error: 'There was an error. Please try again.' }),
						{ status: 500 }
					);
				case 'missing-name':
					// Unreachable for the login kind; kept for exhaustiveness.
					return new Response(JSON.stringify(GENERIC_SUCCESS), { status: 200 });
			}
	}
};
