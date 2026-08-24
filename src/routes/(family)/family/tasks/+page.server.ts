import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getTasksForFamily } from '$lib/server/db/actions/tasks';
import { db } from '$lib/server/db';
import { familyMembers } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, '/login');
	}

	const [member] = await db
		.select()
		.from(familyMembers)
		.where(eq(familyMembers.userId, event.locals.user.id));

	if (!member?.familyId) {
		return redirect(302, '/family');
	}

	// Overdue Recurring Tasks stick to today until done (cursor v2).
	const { syncRecurringCursors } = await import('$lib/server/db/actions/tasks');
	await syncRecurringCursors(event.locals.user.id, member.familyId);

	const tasks = await getTasksForFamily(member.familyId);

	return {
		tasks,
		familyId: member.familyId,
		userId: event.locals.user.id
	};
};
