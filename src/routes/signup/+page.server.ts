// +page.server.ts
import type { PageServerLoad } from './$types';
import { type RequestEvent } from '@sveltejs/kit';

export const load: PageServerLoad = async (event: RequestEvent) => {
	return {
		isLoggedIn: !!event.locals.user,
	};
};
