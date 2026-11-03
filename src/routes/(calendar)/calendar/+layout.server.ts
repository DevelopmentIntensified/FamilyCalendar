// +page.server.ts
import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { loadUserScope } from '$lib/server/services/userScope';
export const load: LayoutServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, '/login');
	}
	// Shared group data (#041): familyId + roster load ONCE per group entry —
	// layout data persists across in-group client navs, so member pages reuse
	// via parent() instead of refetching. Degrades to null/[] never 500s.
	// Same reader as the /api twins of these pages (#292).
	const { userSettings, familyId, familyMembers } = await loadUserScope(event.locals.user.id);
	return {
		pathname: event.url.pathname,
		isLoggedIn: true,
		user: event.locals.user,
		userSettings,
		familyId,
		familyMembers
	};
};
