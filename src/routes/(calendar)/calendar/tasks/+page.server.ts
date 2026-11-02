import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
	getMyTasks,
	getPendingAssignments,
	getRequestedByMe,
	getTasksForUser
} from '$lib/server/db/actions/tasks';
import { listCategoryOptions } from '$lib/server/db/actions/taskCategories';
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

	// The four list legs resolve together. Each leg degrades to its
	// fallback independently (same contract as the guards).
	const uid = event.locals.user!.id;
	// A failing leg degrades to its fallback — but the DB error text is
	// logged (a missing migration surfaces here, not as a silent []).
	const leg = async <T>(label: string, fn: () => Promise<T>, fallback: T) => {
		try {
			// SAFETY: null must widen to the string|null union shared with the catch branch.
			return { value: await fn(), warning: null as string | null };
		} catch (e) {
			console.error(
				'[tasks-leg]',
				JSON.stringify({
					uid,
					label,
					error: e instanceof Error ? e.message : String(e)
				})
			);
			// SAFETY: literal must widen to the string|null union shared with the ok branch.
			return { value: fallback, warning: label as string | null };
		}
	};
	// Awaited (not streamed): the tasks shell previously streamed this
	// promise and stalled on some clients — the family page awaits and
	// always renders, so this matches that contract.
	// #280: the viewer's category list for the editor combobox + manage
	// section. Never throws (degrades to []), so it rides alongside the lists.
	const categoriesP = listCategoryOptions(uid);
	const taskLists = await (async () => {
		// Cursor pin (110; "cursor v3") lives inside getTasksForUser; the
		// section reads below don't sync, so they wait for it (#235) —
		// in parallel they read yesterday's overdue cursor on first load.
		const tasks = await leg(
			'tasks+cursor',
			async () => getTasksForUser(uid, familyId, userZone),
			[]
		);
		const [myTasks, pending, requested] = await Promise.all([
			// Sectioned task lists (issue 019): the main list is MY tasks
			// (personal + accepted assignments); pending assignments feed the
			// "To accept" tab, assigned-out rows the "Requested" tab.
			// (familyAssignedToMe/publicFamilyTasks were dead payload —
			// fetched but never read. Removed #044.)
			leg('myTasks', () => getMyTasks(uid), []),
			leg('pending', () => getPendingAssignments(uid), []),
			leg('requested', () => getRequestedByMe(uid), [])
		]);
		const warnings = [tasks.warning, myTasks.warning, pending.warning, requested.warning].filter(
			(w): w is string => w !== null
		);
		return {
			// Legacy full-list field (personal + family rows) — kept until every
			// consumer has moved to the sectioned lists below.
			tasks: tasks.value,
			myTasks: myTasks.value,
			pendingAssignments: pending.value,
			requestedByMe: requested.value,
			warnings
		};
	})();

	// Family roster for the assignee picker — from the group layout (#041).
	const familyMembersList = (parentData.familyMembers ?? []).map(
		({ userId, firstName, lastName, email }) => ({ userId, firstName, lastName, email })
	);

	return {
		taskLists,
		taskCategories: await categoriesP,
		familyMembers: familyMembersList,
		familyId: familyId ?? null,
		loadWarnings
	};
};
