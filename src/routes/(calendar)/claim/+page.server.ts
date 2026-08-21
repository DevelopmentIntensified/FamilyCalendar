import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getUserByEmail } from '$lib/server/db/actions/users';
import { issueClaimToken } from '$lib/server/services/claimService';
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
	return {
		conflict: event.url.searchParams.get('conflict') === '1',
		email: event.url.searchParams.get('email') || ''
	};
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

		const existingUser = await getUserByEmail(email);
		if (existingUser) {
			// Claim Conflict: route through login-then-merge, never silent merge.
			throw redirect(302, `/claim?conflict=1&email=${encodeURIComponent(email)}`);
		}

		const token = await issueClaimToken(locals.user.id, email);

		const verifyUrl = `${getUrl()}/claim/verify/${token}`;
		try {
			await sendEmail({
				to: email,
				from: 'onboarding@resend.dev',
				subject: 'Save your Family Planz calendar',
				html: `<p>Click the link below to add this email to your Family Planz account and sync your calendar across devices:</p><p><a href="${verifyUrl}">Save my calendar</a></p><p>This link expires in 15 minutes.</p>`
			});
		} catch (e) {
			console.error('Failed to send claim email:', e);
			return fail(500, { error: 'Failed to send email. Please try again.' });
		}

		return { success: true, email };
	}
};
