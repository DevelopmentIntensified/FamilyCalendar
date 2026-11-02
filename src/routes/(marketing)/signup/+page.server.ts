// +page.server.ts
import type { PageServerLoad } from './$types';
import { type RequestEvent } from '@sveltejs/kit';
import { isRegisteredAccount } from '$lib/utils/anonymous';
import { safeRedirectPath } from '$lib/utils/safeRedirect';

export const load: PageServerLoad = async (event: RequestEvent) => {
	return {
		isLoggedIn: isRegisteredAccount(event.locals.user),
		// #244: where to land after auth (invite join, checkout) — same-origin only.
		redirectTo: safeRedirectPath(event.url.searchParams.get('redirect'))
	};
};
