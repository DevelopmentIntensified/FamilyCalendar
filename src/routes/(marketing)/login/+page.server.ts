// +page.server.ts
import type { PageServerLoad } from './$types';
import { isRegisteredAccount } from '$lib/utils/anonymous';
import { safeRedirectPath } from '$lib/utils/safeRedirect';

export const load: PageServerLoad = async (event) => {
	return {
		isLoggedIn: isRegisteredAccount(event.locals.user),
		// When coming from the guest claim flow (?merge=1), show the login form
		// even though the anonymous guest is technically "logged in" — they need
		// to sign into their existing account so their guest data can merge in.
		mergeMode: event.url.searchParams.get('merge') === '1',
		// #244: where to land after auth (invite join, checkout) — same-origin only.
		redirectTo: safeRedirectPath(event.url.searchParams.get('redirect'))
	};
};
