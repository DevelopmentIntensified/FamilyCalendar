/**
 * Tasks page data (#292 L0): the /calendar/tasks loader body, extracted so
 * the web page and `GET /api/tasks/sections` read through ONE function.
 * Each list leg degrades to its fallback independently and records a
 * warning label instead of failing the whole read.
 */
import {
	getMyTasks,
	getPendingAssignments,
	getRequestedByMe,
	getTasksForUser
} from '$lib/server/db/actions/tasks';

type Leg<T> = { value: T; warning: string | null };

export async function loadTaskSections(uid: string, familyId: string | null, userZone: string) {
	// A failing leg degrades to its fallback — but the DB error text is
	// logged (a missing migration surfaces here, not as a silent []).
	const leg = async <T>(label: string, fn: () => Promise<T>, fallback: T): Promise<Leg<T>> => {
		try {
			return { value: await fn(), warning: null };
		} catch (e) {
			console.error(
				'[tasks-leg]',
				JSON.stringify({
					uid,
					label,
					error: e instanceof Error ? e.message : String(e)
				})
			);
			return { value: fallback, warning: label };
		}
	};
	// Cursor pin (110; "cursor v3") lives inside getTasksForUser; the
	// section reads below don't sync, so they wait for it (#235) —
	// in parallel they read yesterday's overdue cursor on first load.
	const tasks = await leg('tasks+cursor', async () => getTasksForUser(uid, familyId, userZone), []);
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
}
