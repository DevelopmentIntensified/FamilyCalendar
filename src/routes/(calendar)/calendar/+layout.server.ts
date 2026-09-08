// +page.server.ts
import { getUserSettings } from '$lib/server/db/actions/userSettings';
import { getFamilyRoster, getUserFamilyId } from '$lib/server/db/actions/families';
import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
export const load: LayoutServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, '/login');
	}
	const userSettings = await getUserSettings(event.locals.user.id);
	// Shared group data (#041): familyId + roster load ONCE per group entry —
	// layout data persists across in-group client navs, so member pages reuse
	// via parent() instead of refetching. Degrades to null/[] never 500s.
	let familyId: string | null = null;
	let familyMembers: Awaited<ReturnType<typeof getFamilyRoster>> = [];
	try {
		familyId = await getUserFamilyId(event.locals.user.id);
		if (familyId) familyMembers = await getFamilyRoster(familyId);
	} catch {
		familyId = null;
		familyMembers = [];
	}
	return {
		pathname: event.url.pathname,
		isLoggedIn: true,
		user: event.locals.user,
		userSettings,
		familyId,
		familyMembers
	};
};
