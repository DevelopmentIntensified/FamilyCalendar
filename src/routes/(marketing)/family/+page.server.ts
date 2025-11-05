// on server load fetch user families and pass to page
import { getUserFamilies } from '$lib/server/db/actions/families';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
    const families = await getUserFamilies(locals.user.id)

    return { families }
}