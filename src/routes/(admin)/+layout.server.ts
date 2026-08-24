import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, '/login');
	}
	if (!event.locals.user.roles?.includes('admin')) {
		return redirect(302, '/calendar');
	}
	return {};
};
