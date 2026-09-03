import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getTasksForUser, syncRecurringCursors } from '$lib/server/db/actions/tasks';
import { getUserZone } from '$lib/server/utils/userTimezone';
import { getFamilyRoster, getUserFamilyId } from '$lib/server/db/actions/families';
import { guard } from '$lib/server/utils/guard';

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, '/login');
	}
	// Section loads are guarded: a failing model degrades to its fallback
	// instead of 500ing the whole page.
	const loadWarnings: string[] = [];

	const familyG = await guard('family', null, () => getUserFamilyId(event.locals.user!.id));
	if (familyG.error) loadWarnings.push(familyG.error);
	const familyId = familyG.data;

	const tasksG = await guard('tasks', [], async () => {
		// Overdue Recurring Tasks stick to today until done (cursor v3).
		await syncRecurringCursors(event.locals.user!.id, familyId, await getUserZone(event.locals.user!.id));
		return await getTasksForUser(event.locals.user!.id, familyId);
	});
	if (tasksG.error) loadWarnings.push(tasksG.error);
	const userTasks = tasksG.data;

	// Family roster for the assignee picker.
	let familyMembersList: { userId: string; firstName: string; lastName: string; email: string | null }[] = [];
	if (familyId) {
		const rosterG = await guard('family', [], () => getFamilyRoster(familyId));
		if (rosterG.error) loadWarnings.push(rosterG.error);
		familyMembersList = rosterG.data.map(({ userId, firstName, lastName, email }) => ({
			userId,
			firstName,
			lastName,
			email
		}));
	}

	return {
		tasks: userTasks,
		familyMembers: familyMembersList,
		familyId: familyId ?? null,
		loadWarnings
	};
};
