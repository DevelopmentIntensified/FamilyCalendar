// +page.server.ts
import type { LayoutServerLoad } from './$types';
import { ADAPTER } from '$env/static/private';

export const prerender = ADAPTER === 'static';
export const ssr = ADAPTER === 'static';

export const load: LayoutServerLoad = async (event) => {
	return {
		pathname: event.url.pathname,
		// The origin the request actually arrived on, not a hardcoded
		// familyplanz.com: there are three environments (prod, test.familyplanz.com,
		// a preview URL) and a canonical that points at the wrong one is worse than
		// no canonical. og:url and <link rel=canonical> have to be absolute, and
		// they have to self-reference.
		origin: event.url.origin,
		isLoggedIn: !!event.locals.user,
		user: event.locals.user
	};
};
