// on server load fetch user families and pass to page
import { getUserFamilies } from '$lib/server/db/actions/families';
import { db } from '$lib/server/db';
import { familyMembers } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
    const userFamily = await getUserFamilies(locals.user.id)
    
    if (!userFamily?.families) {
        return { families: [] };
    }
    
    const family = userFamily.families;
    const memberCount = await db.select({ id: familyMembers.id }).from(familyMembers).where(eq(familyMembers.familyId, family.id));
    
    return { families: [{ ...family, memberCount: memberCount.length }] };
}