import type { PageServerLoad } from './$types';
import { verifyInviteCode } from '$lib/server/db/actions/families';

/**
 * Issue 124 — a link that cannot be used, explained where the person is.
 *
 * This used to redirect to `/family?error=invalid_invite`. Nothing read that
 * parameter, and for a signed-out visitor `/family` redirects again to sign-in,
 * so somebody who followed a stale link out of an email was dumped two pages
 * away with no explanation at all.
 *
 * The page answers instead of redirecting. `verifyInviteCode` returns null for
 * three different reasons — unknown, expired, used up — and cannot tell them
 * apart, so `invalid` says the link is unusable without claiming to know which
 * of the three it was. The code is still returned so the page can name the link
 * that failed; nothing else uses it on this path.
 */
export const load: PageServerLoad = async ({ params, locals }) => {
	const { code } = params;

	const result = await verifyInviteCode(code);

	return {
		invalid: !result,
		family: result
			? {
					id: result.family.id,
					name: result.family.name,
					color: result.family.color
				}
			: null,
		code,
		isLoggedIn: !!locals.user
	};
};