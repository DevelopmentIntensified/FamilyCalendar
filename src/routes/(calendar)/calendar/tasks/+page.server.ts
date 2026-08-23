import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getTasksForUser, syncRecurringCursors } from '$lib/server/db/actions/tasks';
import { db } from '$lib/server/db';
import { familyMembers, users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, '/login');
	}

	const [member] = await db
		.select()
		.from(familyMembers)
		.where(eq(familyMembers.userId, event.locals.user.id));

	// Overdue Recurring Tasks stick to today until done (cursor v2).
	await syncRecurringCursors(event.locals.user.id, member?.familyId ?? null);

	const userTasks = await getTasksForUser(event.locals.user.id, member?.familyId ?? null);

	// Family roster for the assignee picker.
	let familyMembersList: { userId: string; firstName: string; lastName: string; email: string | null }[] = [];
	if (member?.familyId) {
		familyMembersList = await db
			.select({
				userId: users.id,
				firstName: users.firstName,
				lastName: users.lastName,
				email: users.email
			})
			.from(familyMembers)
			.innerJoin(users, eq(familyMembers.userId, users.id))
			.where(eq(familyMembers.familyId, member.familyId));
	}

	return {
		tasks: userTasks,
		familyMembers: familyMembersList,
		familyId: member?.familyId ?? null
	};
};
