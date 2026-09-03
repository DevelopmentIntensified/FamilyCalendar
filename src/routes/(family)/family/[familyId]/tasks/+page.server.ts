import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
	getTasksForFamily,
	isFamilyMember,
	syncRecurringCursors
} from '$lib/server/db/actions/tasks';
import { getUserZone } from '$lib/server/utils/userTimezone';
import { db } from '$lib/server/db';
import { families } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { getFamilyRoster } from '$lib/server/db/actions/families';

export const load: PageServerLoad = async ({ params, locals }) => {
	// Viewing the family task list requires membership (existence only;
	// `role` stays permission-only per ADR-0001).
	if (!(await isFamilyMember(locals.user.id, params.familyId))) {
		return redirect(302, '/family');
	}

	const [family] = await db.select().from(families).where(eq(families.id, params.familyId));
	if (!family) {
		return redirect(302, '/family');
	}

	// Overdue Recurring Tasks stick to today until done (cursor v3).
	await syncRecurringCursors(locals.user.id, params.familyId, await getUserZone(locals.user.id));

	const [familyTasks, roster] = await Promise.all([
		getTasksForFamily(params.familyId),
		getFamilyRoster(params.familyId)
	]);

	return {
		family,
		tasks: familyTasks,
		members: roster.map(({ userId, firstName, lastName, email }) => ({
			userId,
			firstName,
			lastName,
			email
		})),
		currentUserId: locals.user.id
	};
};
