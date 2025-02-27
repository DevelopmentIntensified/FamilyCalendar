// +page.server.ts
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	return {
		isLoggedIn: !!event.locals.user
	};
};
