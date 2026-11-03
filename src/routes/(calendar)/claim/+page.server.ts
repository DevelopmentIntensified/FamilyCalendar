import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { isRegisteredAccount } from '$lib/utils/anonymous';
import {
	defaultClaimRequestDeps,
	requestClaimLink,
	type ClaimRequestDeps
} from '$lib/server/services/claimRequest';

export type { ClaimRequestDeps };

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, '/login');
	}
	// Already-claimed users don't need to claim.
	if (isRegisteredAccount(event.locals.user)) {
		return redirect(302, '/calendar');
	}
	return {};
};

export const actions: Actions = {
	// The body is shared with POST /api/me/claim (#292 G13).
	request: async ({ request, locals }, deps: ClaimRequestDeps = defaultClaimRequestDeps) => {
		if (!locals.user) return fail(401, { error: 'Not signed in' });
		const result = await requestClaimLink(
			request,
			locals.user,
			async () => (await request.formData()).get('email'),
			deps
		);
		if (!result.ok) return fail(result.status, { error: result.error });
		// Uniform shape: never echoes whether the address is registered.
		return { success: true, email: result.email };
	}
};
