import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getTasksForUser, syncRecurringCursors } from '$lib/server/db/actions/tasks';
import { getUserZone } from '$lib/server/utils/userTimezone';
import { getFamilyRoster, getUserFamilyId } from '$lib/server/db/actions/families';

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, '/login');
	}

	const familyId = await getUserFamilyId(event.locals.user.id);

	// Overdue Recurring Tasks stick to today until done (cursor v3).
	await syncRecurringCursors(event.locals.user.id, familyId, await getUserZone(event.locals.user.id));

	const userTasks = await getTasksForUser(event.locals.user.id, familyId);

	// Family roster for the assignee picker.
	let familyMembersList: { userId: string; firstName: string; lastName: string; email: string | null }[] = [];
	if (familyId) {
		familyMembersList = (await getFamilyRoster(familyId)).map(
			({ userId, firstName, lastName, email }) => ({ userId, firstName, lastName, email })
		);
	}

	return {
		tasks: userTasks,
		familyMembers: familyMembersList,
		familyId: familyId ?? null
	};
};
