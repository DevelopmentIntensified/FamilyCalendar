import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Calendar settings moved to /account (Calendar section).
export const load: PageServerLoad = async () => {
	throw redirect(302, '/account#calendar');
};
