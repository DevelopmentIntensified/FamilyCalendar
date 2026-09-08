import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { issueClaimToken } from '$lib/server/services/claimService';
import { getUserByEmail } from '$lib/server/db/actions/users';
import {
	sendClaimLinkEmail,
	magicLinkDeps,
	type MagicLinkDeps
} from '$lib/server/services/magicLink';
import { getUrl } from '$lib/utils/getUrl';

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, '/login');
	}
	// Already-claimed users don't need to claim.
	if (event.locals.user.email) {
		return redirect(302, '/calendar');
	}
	return {};
};

function isString(value: FormDataEntryValue | null): value is string {
	return typeof value === 'string';
}

/**
 * Collaborators the request action needs, injectable so tests can pass fakes
 * through a real seam instead of mocking modules. The email send goes through
 * the magicLink module so the from-address never drifts again; token storage
 * stays in claimService.
 */
export type ClaimRequestDeps = Pick<MagicLinkDeps, 'sendEmail' | 'fromEmail'> & {
	issueClaimToken: typeof issueClaimToken;
	getUserByEmail: typeof getUserByEmail;
	sendClaimLinkEmail: typeof sendClaimLinkEmail;
	baseSiteUrl: string;
};

const defaultDeps: ClaimRequestDeps = {
	sendEmail: magicLinkDeps.sendEmail,
	fromEmail: magicLinkDeps.fromEmail,
	issueClaimToken,
	getUserByEmail,
	sendClaimLinkEmail,
	baseSiteUrl: getUrl()
};

export const actions: Actions = {
	request: async ({ request, locals }, deps: ClaimRequestDeps = defaultDeps) => {
		if (!locals.user) return fail(401, { error: 'Not signed in' });
		if (locals.user.email) return fail(400, { error: 'Account already has an email' });

		const formData = await request.formData();
		const rawEmail = formData.get('email');
		const email = (isString(rawEmail) ? rawEmail : '').trim().toLowerCase();
		if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			return fail(400, { error: 'Please enter a valid email address' });
		}

		// Note: we intentionally do NOT block on an already-registered email here.
		// Ownership is proven by the verification link click; the verify endpoint
		// then auto-merges the guest's data into that existing account.
		const token = await deps.issueClaimToken(locals.user.id, email);

		const verifyUrl = `${deps.baseSiteUrl}/claim/verify/${token}`;
		// Tailor the email: an already-registered address means clicking the link
		// will merge this device's calendar into that existing account.
		const existingUser = await deps.getUserByEmail(email);
		const alreadyRegistered = !!existingUser;

		// Canonical from-address (NOREPLYEMAIL) comes from the magicLink module.
		const sent = await deps.sendClaimLinkEmail(deps, { email, verifyUrl, alreadyRegistered });
		if (!sent.ok) {
			return fail(500, { error: 'Failed to send email. Please try again.' });
		}

		return { success: true, email, alreadyRegistered };
	}
};
