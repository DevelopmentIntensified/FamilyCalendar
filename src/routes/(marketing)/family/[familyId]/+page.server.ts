import { getUserFamilies, removeFamilyMember, updateFamilies } from '$lib/server/db/actions/families';
import { db } from '$lib/server/db';
import { families, familyMembers, users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';

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

export const actions: Actions = {
	removeMember: async ({ request, params }) => {
		const formData = await request.formData();
		const userId = formData.get('userId') as string;
		
		if (!userId) {
			return fail(400, { error: 'User ID is required' });
		}
		
		await removeFamilyMember(params.familyId, userId);
		return { success: true };
	},
	updateFamily: async ({ request, params }) => {
		const formData = await request.formData();
		const name = formData.get('name') as string;
		const color = formData.get('color') as string;
		
		const updateData: { name?: string; color?: string } = {};
		if (name) updateData.name = name;
		if (color) updateData.color = color;
		
		if (Object.keys(updateData).length > 0) {
			await updateFamilies(params.familyId, updateData);
		}
		return { success: true };
	}
};