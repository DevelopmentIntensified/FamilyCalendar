import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getOpenGroceries, getStoreColours } from '$lib/server/db/actions/groceries';
import { getUserFamilyId } from '$lib/server/db/actions/families';

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, '/login');
	}
	const uid = event.locals.user.id;
	const familyId = await getUserFamilyId(uid);

	const leg = async <T>(fn: () => Promise<T>, fallback: T) => {
		try {
			return await fn();
		} catch {
			return fallback;
		}
	};

	const [mine, family, colours] = await Promise.all([
		leg(() => getOpenGroceries({ userId: uid, familyId: null }), []),
		familyId ? leg(() => getOpenGroceries({ userId: uid, familyId }), []) : Promise.resolve([]),
		// The colour rows themselves; the three-tier resolution is client-side
		// ($lib/data/groceries) and is by VIEWER, not by which tab is open.
		leg(() => getStoreColours({ userId: uid, familyId }), [])
	]);

	return { mine, family, hasFamily: !!familyId, userId: uid, familyId, colours };
};
