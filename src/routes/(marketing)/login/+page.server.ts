// +page.server.ts
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	return {
		isLoggedIn: !!event.locals.user,
		// When coming from the guest claim flow (?merge=1), show the login form
		// even though the anonymous guest is technically "logged in" — they need
		// to sign into their existing account so their guest data can merge in.
		mergeMode: event.url.searchParams.get('merge') === '1'
	};
};
