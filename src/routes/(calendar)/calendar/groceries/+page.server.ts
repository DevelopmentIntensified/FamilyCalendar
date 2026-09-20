import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getOpenGroceries } from '$lib/server/db/actions/groceries';
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

	const [mine, family] = await Promise.all([
		leg(() => getOpenGroceries({ userId: uid, familyId: null }), []),
		familyId
			? leg(() => getOpenGroceries({ userId: uid, familyId }), [])
			: Promise.resolve([])
	]);

	return { mine, family, hasFamily: !!familyId };
};
