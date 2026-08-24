import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getTasksForFamily, syncRecurringCursors } from '$lib/server/db/actions/tasks';
import { db } from '$lib/server/db';
import { families, familyMembers, users } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ params, locals }) => {
	const [member] = await db
		.select({ role: familyMembers.role })
		.from(familyMembers)
		.where(
			and(eq(familyMembers.familyId, params.familyId), eq(familyMembers.userId, locals.user.id))
		)
		.limit(1);

	if (!member) {
		return redirect(302, '/family');
	}

	const [family] = await db.select().from(families).where(eq(families.id, params.familyId));
	if (!family) {
		return redirect(302, '/family');
	}

	// Overdue Recurring Tasks stick to today until done (cursor v2).
	await syncRecurringCursors(locals.user.id, params.familyId);

	const [familyTasks, roster] = await Promise.all([
		getTasksForFamily(params.familyId),
		db
			.select({
				userId: users.id,
				firstName: users.firstName,
				lastName: users.lastName,
				email: users.email
			})
			.from(familyMembers)
			.innerJoin(users, eq(familyMembers.userId, users.id))
			.where(eq(familyMembers.familyId, params.familyId))
	]);

	return {
		family,
		tasks: familyTasks,
		members: roster,
		currentUserId: locals.user.id
	};
};
