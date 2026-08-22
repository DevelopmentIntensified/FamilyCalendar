import { redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import {
	GUEST_MERGE_COOKIE,
	getGuestDataCounts,
	isClaimableGuest,
	mergeGuestIntoUser
} from '$lib/server/services/guestMergeService';

async function readStash(cookieStore: { get: (n: string) => string | undefined }): Promise<string | null> {
	const guestId = cookieStore.get(GUEST_MERGE_COOKIE);
	if (!guestId) return null;
	return (await isClaimableGuest(guestId)) ? guestId : null;
}

export const load: PageServerLoad = async ({ locals, cookies }) => {
	if (!locals.user) throw redirect(302, '/login');
	if (locals.user.email === null) throw redirect(302, '/claim');

	const guestId = await readStash(cookies);
	if (!guestId || guestId === locals.user.id) throw redirect(302, '/calendar');

	const counts = await getGuestDataCounts(guestId);
	if (counts.events + counts.tasks === 0) {
		// Nothing worth merging — clear and move on.
		cookies.delete(GUEST_MERGE_COOKIE, { path: '/' });
		throw redirect(302, '/calendar');
	}

	return {
		guestEvents: counts.events,
		guestTasks: counts.tasks,
		accountFirstName: locals.user.firstName
	};
};

export const actions: Actions = {
	merge: async ({ locals, cookies }) => {
		if (!locals.user) throw redirect(302, '/login');
		const guestId = await readStash(cookies);
		if (guestId && guestId !== locals.user.id) {
			const result = await mergeGuestIntoUser(guestId, locals.user.id);
			if (result && result.events + result.tasks > 0) {
				throw redirect(302, `/calendar?merged=${result.events}&tasks=${result.tasks}`);
			}
		}
		cookies.delete(GUEST_MERGE_COOKIE, { path: '/' });
		throw redirect(302, '/calendar');
	},
	skip: async ({ cookies }) => {
		cookies.delete(GUEST_MERGE_COOKIE, { path: '/' });
		throw redirect(302, '/calendar');
	}
};
