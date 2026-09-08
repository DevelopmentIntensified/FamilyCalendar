import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
	getFamilyTasksAssignedTo,
	getMyTasks,
	getPendingAssignments,
	getPublicTasksForFamily,
	getRequestedByMe,
	getTasksForUser,
	syncRecurringCursors
} from '$lib/server/db/actions/tasks';
import { zoneFromSettings } from '$lib/server/utils/userTimezone';
import { guard } from '$lib/server/utils/guard';

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, '/login');
	}
	// Section loads are guarded: a failing model degrades to its fallback
	// instead of 500ing the whole page.
	const loadWarnings: string[] = [];

	// Family scope + zone come from the group layout (#041) — no refetch.
	const parentData = await event.parent();
	const familyId = parentData.familyId;
	const userZone = zoneFromSettings(parentData.userSettings) ?? 'UTC';

	const tasksG = await guard('tasks', [], async () => {
		// Overdue Recurring Tasks stick to today until done (cursor v3).
		await syncRecurringCursors(event.locals.user!.id, familyId, userZone);
		return await getTasksForUser(event.locals.user!.id, familyId);
	});
	if (tasksG.error) loadWarnings.push(tasksG.error);

	// Sectioned task lists (issue 019): the main list is MY tasks
	// (personal + accepted assignments); pending assignments feed the
	// "To accept" tab, assigned-out rows the "Requested" tab, and family
	// tasks assigned to me the Family chip.
	const myTasksG = await guard('tasks', [], () => getMyTasks(event.locals.user!.id));
	if (myTasksG.error) loadWarnings.push(myTasksG.error);

	const pendingG = await guard('tasks', [], () => getPendingAssignments(event.locals.user!.id));
	if (pendingG.error) loadWarnings.push(pendingG.error);

	const requestedG = await guard('tasks', [], () => getRequestedByMe(event.locals.user!.id));
	if (requestedG.error) loadWarnings.push(requestedG.error);

	const familyAssignedG = await guard('tasks', [], async () =>
		familyId ? getFamilyTasksAssignedTo(event.locals.user!.id, familyId) : []
	);
	if (familyAssignedG.error) loadWarnings.push(familyAssignedG.error);

	// Public tasks of my family members (family pages' Public tab source).
	const publicG = await guard('tasks', [], async () =>
		familyId ? getPublicTasksForFamily(familyId) : []
	);
	if (publicG.error) loadWarnings.push(publicG.error);

	// Family roster for the assignee picker — from the group layout (#041).
	const familyMembersList = (parentData.familyMembers ?? []).map(
		({ userId, firstName, lastName, email }) => ({ userId, firstName, lastName, email })
	);

	return {
		// Legacy full-list field (personal + family rows) — kept until every
		// consumer has moved to the sectioned lists below.
		tasks: tasksG.data,
		myTasks: myTasksG.data,
		pendingAssignments: pendingG.data,
		requestedByMe: requestedG.data,
		familyTasksAssignedToMe: familyAssignedG.data,
		publicFamilyTasks: publicG.data,
		familyMembers: familyMembersList,
		familyId: familyId ?? null,
		loadWarnings
	};
};
