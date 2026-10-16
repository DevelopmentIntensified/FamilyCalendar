import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getPublicTasksForFamily, getTasksForFamily } from '$lib/server/db/actions/tasks';
import { getFamilyRoster, getUserFamilyMemberships } from '$lib/server/db/actions/families';
import { getUserZone } from '$lib/server/utils/userTimezone';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		return redirect(302, '/login');
	}

	const memberships = await getUserFamilyMemberships(locals.user.id);

	// `?familyId=` addresses one family; without it the OLDEST family is chosen —
	// defined, rather than whatever `familyMembers` row the database hands back.
	// This used to take the user's FIRST membership row, so a user in two
	// families got whichever one the database felt like, and the board could
	// only ever be about one of them (issue 098's bug class, still here).
	const requested = url.searchParams.get('familyId');
	const chosen = memberships.find((m) => m.family.id === requested) ?? memberships[0] ?? null;

	if (!chosen) {
		return redirect(302, '/family');
	}
	const familyId = chosen.family.id;

	const zone = await getUserZone(locals.user.id);

	const [tasks, publicTasks, familyRoster] = await Promise.all([
		// Cursor pin (110) now lives inside each list read (family scope,
		// plus the member-personal leg for the public tab).
		getTasksForFamily(familyId, zone),
		getPublicTasksForFamily(familyId, zone),
		getFamilyRoster(familyId)
	]);

	return {
		tasks,
		publicTasks,
		familyRoster,
		familyId,
		userId: locals.user.id
	};
};
