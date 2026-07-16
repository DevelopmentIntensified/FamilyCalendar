import { getUserFamilies, removeFamilyMember, updateFamilies } from '$lib/server/db/actions/families';
import { db } from '$lib/server/db';
import { families, familyMembers, users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, locals }) => {
	try {
		const [currentMember] = await db
			.select({ role: familyMembers.role })
			.from(familyMembers)
			.where(eq(familyMembers.familyId, params.familyId))
			.where(eq(familyMembers.userId, locals.user.id))
			.limit(1);

		if (!currentMember) {
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
				firstName: users.firstName,
				lastName: users.lastName,
				email: users.email,
				role: familyMembers.role
			})
			.from(familyMembers)
			.innerJoin(users, eq(familyMembers.userId, users.id))
			.where(eq(familyMembers.familyId, params.familyId));

		return { family, members, currentUserRole: currentMember.role || 'member', currentUserId: locals.user.id };
	} catch (error) {
		console.error('[load] Error:', error);
		return { family: null, members: [], currentUserRole: null };
	}
};

async function requireAdmin(familyId: string, userId: string) {
	const [member] = await db
		.select({ role: familyMembers.role })
		.from(familyMembers)
		.where(eq(familyMembers.familyId, familyId))
		.where(eq(familyMembers.userId, userId))
		.limit(1);

	if (!member || member.role !== 'admin') {
		return fail(403, { error: 'Only admins can perform this action' });
	}
}

export const actions: Actions = {
	removeMember: async ({ request, params, locals }) => {
		const formData = await request.formData();
		const userId = formData.get('userId') as string;
		const familyId = params.familyId;
		
		if (!userId) {
			return fail(400, { error: 'User ID is required' });
		}

		const roleCheck = await requireAdmin(familyId, locals.user.id);
		if (roleCheck) return roleCheck;
		
		await removeFamilyMember(familyId, userId);
		return { success: true };
	},
	updateRole: async ({ request, params, locals }) => {
		const formData = await request.formData();
		const userId = formData.get('userId') as string;
		const role = formData.get('role') as string;
		const familyId = params.familyId;

		if (!userId || !role) {
			return fail(400, { error: 'User ID and role are required' });
		}

		if (role !== 'admin' && role !== 'member') {
			return fail(400, { error: 'Role must be admin or member' });
		}

		const roleCheck = await requireAdmin(familyId, locals.user.id);
		if (roleCheck) return roleCheck;

		await db.update(familyMembers).set({ role }).where(eq(familyMembers.familyId, familyId)).where(eq(familyMembers.userId, userId));
		return { success: true };
	},
	updateFamily: async ({ request, params, locals }) => {
		const formData = await request.formData();
		const name = formData.get('name') as string;
		const color = formData.get('color') as string;
		
		const roleCheck = await requireAdmin(params.familyId, locals.user.id);
		if (roleCheck) return roleCheck;

		const updateData: { name?: string; color?: string } = {};
		if (name) updateData.name = name;
		if (color) updateData.color = color;
		
		if (Object.keys(updateData).length > 0) {
			await updateFamilies(params.familyId, updateData);
		}
		return { success: true };
	}
};