// +page.server.ts
import type { LayoutServerLoad } from './$types';
import { ADAPTER } from '$env/static/private';

export const prerender = ADAPTER === 'static';
export const ssr = ADAPTER === 'static';

export const load: LayoutServerLoad = async (event) => {
	return {
		pathname: event.url.pathname,
		isLoggedIn: !!event.locals.user,
		user: event.locals.user
	};
};
