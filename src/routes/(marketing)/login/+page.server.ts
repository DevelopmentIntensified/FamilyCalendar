// +page.server.ts
import type { PageServerLoad } from '../../login/$types';

export const load: PageServerLoad = async (event) => {
	return {
		isLoggedIn: !!event.locals.user
	};
};
