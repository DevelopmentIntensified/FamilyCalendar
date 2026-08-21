import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getTasksForUser } from '$lib/server/db/actions/tasks';
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

	const userTasks = await getTasksForUser(event.locals.user.id, member?.familyId ?? null);

	return {
		tasks: userTasks
	};
};
