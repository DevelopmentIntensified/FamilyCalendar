// +page.server.ts
import { getUserSettings } from '$lib/server/db/actions/userSettings';
import type { LayoutServerLoad } from './$types';
export const load: LayoutServerLoad = async (event) => {
	let userSettings = await getUserSettings(event.locals.user.id);
	return {
		pathname: event.url.pathname,
		isLoggedIn: true,
		user: event.locals.user,
		userSettings
	};
};
