import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { issueClaimToken } from '$lib/server/services/claimService';
import { getUserByEmail } from '$lib/server/db/actions/users';
import { sendEmail } from '$lib/utils/sendEmail';
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

export const actions: Actions = {
	request: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Not signed in' });
		if (locals.user.email) return fail(400, { error: 'Account already has an email' });

		const formData = await request.formData();
		const email = (formData.get('email') as string || '').trim().toLowerCase();
		if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			return fail(400, { error: 'Please enter a valid email address' });
		}

		// Note: we intentionally do NOT block on an already-registered email here.
		// Ownership is proven by the verification link click; the verify endpoint
		// then auto-merges the guest's data into that existing account.
		const token = await issueClaimToken(locals.user.id, email);

		const verifyUrl = `${getUrl()}/claim/verify/${token}`;
		// Tailor the email: an already-registered address means clicking the link
		// will merge this device's calendar into that existing account.
		const existingUser = await getUserByEmail(email);
		const alreadyRegistered = !!existingUser;

		const html = alreadyRegistered
			? `<p>This email already has a Family Planz account. Clicking the link below will bring the calendar you've added on this device into that existing account, so you can keep using it from anywhere.</p><p><a href="${verifyUrl}">Merge my calendar into my account</a></p><p>If you didn't expect this, you can safely ignore this email. The link expires in 15 minutes.</p>`
			: `<p>Click the link below to add this email to your Family Planz account and sync your calendar across devices:</p><p><a href="${verifyUrl}">Save my calendar</a></p><p>This link expires in 15 minutes.</p>`;

		try {
			await sendEmail({
				to: email,
				from: 'onboarding@resend.dev',
				subject: alreadyRegistered
					? 'Merge your calendar into your Family Planz account'
					: 'Save your Family Planz calendar',
				html
			});
		} catch (e) {
			console.error('Failed to send claim email:', e);
			return fail(500, { error: 'Failed to send email. Please try again.' });
		}

		return { success: true, email, alreadyRegistered };
	}
};
