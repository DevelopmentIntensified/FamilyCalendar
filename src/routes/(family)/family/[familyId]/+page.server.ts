import { getUserFamilies, removeFamilyMember, updateFamilies } from '$lib/server/db/actions/families';
import { db } from '$lib/server/db';
import { families, familyMembers, users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, locals }) => {
	try {
		const userFamilies = await getUserFamilies(locals.user.id);
		
		console.log('[load] userFamilies check:', { 
			hasUserFamilies: !!userFamilies, 
			hasFamilies: !!userFamilies?.families,
			familiesId: userFamilies?.families?.id 
		});
		
		if (!userFamilies || !userFamilies.families) {
			console.log('[load] Returning null - no user families');
			return { family: null, members: [], currentUserRole: null };
		}
		
		if (userFamilies.families.id !== params.familyId) {
			console.log('[load] Returning null - family id mismatch');
			return { family: null, members: [], currentUserRole: null };
		}

		const familyResult = await db
			.select()
			.from(families)
			.where(eq(families.id, params.familyId));
		const family = familyResult[0] || null;

		if (!family) {
			return { family: null, members: [], currentUserRole: null };
		}

		const members = await db
			.select({
				userId: familyMembers.userId,
				role: familyMembers.role,
				firstName: users.firstName,
				lastName: users.lastName,
				email: users.email
			})
			.from(familyMembers)
			.innerJoin(users, eq(familyMembers.userId, users.id))
			.where(eq(familyMembers.familyId, params.familyId));

		return { family, members, currentUserRole: userFamilies.familyMembers?.role || null };
	} catch (error) {
		console.error('[load] Error:', error);
		return { family: null, members: [], currentUserRole: null };
	}
};

export const actions: Actions = {
	removeMember: async ({ request, params }) => {
		const formData = await request.formData();
		const userId = formData.get('userId') as string;
		const familyId = params.familyId;
		
		if (!userId) {
			return fail(400, { error: 'User ID is required' });
		}
		
		await removeFamilyMember(familyId, userId);
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