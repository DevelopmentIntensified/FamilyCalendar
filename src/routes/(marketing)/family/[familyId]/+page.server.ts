import { getUserFamilies } from '$lib/server/db/actions/families';
import { db } from '$lib/server/db';
import { families, familyMembers, users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const userFamilies = await getUserFamilies(locals.user.id);
	
	if (!userFamilies || userFamilies.families?.id !== params.familyId) {
		return { family: null, members: [] };
	}

	const family = await db
		.select()
		.from(families)
		.where(eq(families.id, params.familyId))[0];

	const members = await db
		.select({
			id: familyMembers.id,
			userId: familyMembers.userId,
			role: familyMembers.role,
			firstName: users.firstName,
			lastName: users.lastName,
			email: users.email
		})
		.from(familyMembers)
		.innerJoin(users, eq(familyMembers.userId, users.id))
		.where(eq(familyMembers.familyId, params.familyId));

	return { family, members };
};