import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { listCategoryOptions } from '$lib/server/db/actions/taskCategories';
import { zoneFromSettings } from '$lib/server/utils/userTimezone';
import { loadTaskSections } from '$lib/server/services/tasksData';

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

	const uid = event.locals.user!.id;
	// #280: the viewer's category list for the editor combobox + manage
	// section. Never throws (degrades to []), so it rides alongside the lists.
	const categoriesP = listCategoryOptions(uid);
	// Awaited (not streamed): the tasks shell previously streamed this
	// promise and stalled on some clients — the family page awaits and
	// always renders, so this matches that contract. The body is shared
	// with GET /api/tasks/sections (#292 G9).
	const taskLists = await loadTaskSections(uid, familyId ?? null, userZone);

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
