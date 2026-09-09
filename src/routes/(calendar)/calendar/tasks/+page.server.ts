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

	// Streamed lists (#044): shell (header chrome + add-task card) paints
	// first; the six independent lists resolve together after. Each leg
	// degrades to its fallback independently (same contract as the guards).
	const uid = event.locals.user!.id;
	const leg = async <T>(label: string, fn: () => Promise<T>, fallback: T) => {
		try {
			// SAFETY: null must widen to the string|null union shared with the catch branch.
			return { value: await fn(), warning: null as string | null };
		} catch {
			// SAFETY: literal must widen to the string|null union shared with the ok branch.
			return { value: fallback, warning: label as string | null };
		}
	};
	const taskLists = (async () => {
		const [tasks, myTasks, pending, requested, familyAssigned, pub] = await Promise.all([
			leg(
				'tasks',
				async () => {
					// Overdue Recurring Tasks stick to today until done (cursor v3).
					await syncRecurringCursors(uid, familyId, userZone);
					return await getTasksForUser(uid, familyId);
				},
				[]
			),
			// Sectioned task lists (issue 019): the main list is MY tasks
			// (personal + accepted assignments); pending assignments feed the
			// "To accept" tab, assigned-out rows the "Requested" tab, and family
			// tasks assigned to me the Family chip.
			leg('tasks', () => getMyTasks(uid), []),
			leg('tasks', () => getPendingAssignments(uid), []),
			leg('tasks', () => getRequestedByMe(uid), []),
			leg('tasks', async () => (familyId ? getFamilyTasksAssignedTo(uid, familyId) : []), []),
			// Public tasks of my family members (family pages' Public tab source).
			leg('tasks', async () => (familyId ? getPublicTasksForFamily(familyId) : []), [])
		]);
		return {
			// Legacy full-list field (personal + family rows) — kept until every
			// consumer has moved to the sectioned lists below.
			tasks: tasks.value,
			myTasks: myTasks.value,
			pendingAssignments: pending.value,
			requestedByMe: requested.value,
			familyTasksAssignedToMe: familyAssigned.value,
			publicFamilyTasks: pub.value,
			warnings: [
				tasks.warning,
				myTasks.warning,
				pending.warning,
				requested.warning,
				familyAssigned.warning,
				pub.warning
			].filter((w): w is string => w !== null)
		};
	})();

	// Family roster for the assignee picker — from the group layout (#041).
	const familyMembersList = (parentData.familyMembers ?? []).map(
		({ userId, firstName, lastName, email }) => ({ userId, firstName, lastName, email })
	);

	return {
		taskLists,
		familyMembers: familyMembersList,
		familyId: familyId ?? null,
		loadWarnings
	};
};
