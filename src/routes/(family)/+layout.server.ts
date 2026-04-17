// +layout.server.ts
import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, '/login');
	}
	return {
		pathname: event.url.pathname,
		isLoggedIn: true,
		user: event.locals.user
	};
};
