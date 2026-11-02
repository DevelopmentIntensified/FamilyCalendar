// +page.server.ts
import type { PageServerLoad } from './$types';
import { type RequestEvent } from '@sveltejs/kit';
import { isRegisteredAccount } from '$lib/utils/anonymous';

export const load: PageServerLoad = async (event: RequestEvent) => {
	return {
		isLoggedIn: isRegisteredAccount(event.locals.user)
	};
};
