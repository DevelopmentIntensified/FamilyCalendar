import { getUserFamilies } from '$lib/server/db/actions/families';
import { db } from '$lib/server/db';
import { familyInviteCodes, families, familyMembers, users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const userFamilies = await getUserFamilies(locals.user.id);
	
	if (!userFamilies?.families) {
		return { invitations: [] };
	}

	const familyId = userFamilies.families.id;

	const invites = await db
		.select()
		.from(familyInviteCodes)
		.where(eq(familyInviteCodes.familyId, familyId));

	return { 
		invitations: invites,
		family: userFamilies.families
	};
}
