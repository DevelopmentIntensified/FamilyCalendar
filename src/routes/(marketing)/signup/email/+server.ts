import type { RequestEvent } from '@sveltejs/kit';
import { clientKey, rateLimit } from '$lib/server/utils/rateLimit';
import {
	issueMagicLink,
	magicLinkDeps,
	MAGIC_LINK_RATE_LIMIT,
	type MagicLinkDeps,
	type MagicLinkGate
} from '$lib/server/services/magicLink';

export type SignupEmailDeps = MagicLinkDeps & { gate?: MagicLinkGate };

export const POST = async (
	event: RequestEvent,
	deps: SignupEmailDeps = magicLinkDeps
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

	const result = await issueMagicLink(
		deps,
		'signup',
		{ email: data.email, firstName: data.firstName, lastName: data.lastName },
		gate
	);

	switch (result.status) {
		case 'sent':
		// Same success shape as the happy path when the email is already
		// registered — never reveal that the email is taken.
		case 'suppressed':
			return new Response(JSON.stringify({ success: true }), { status: 200 });
		case 'rejected':
			switch (result.reason) {
				case 'invalid-email':
					return new Response(JSON.stringify({ success: false, error: 'Invalid email' }), {
						status: 400
					});
				case 'missing-name':
					return new Response(
						JSON.stringify({ success: false, error: 'First and last name are required' }),
						{ status: 400 }
					);
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
			}
	}
};
