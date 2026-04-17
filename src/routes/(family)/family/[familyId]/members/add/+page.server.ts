import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { families } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async (event) => {
	const familyId = event.params.familyId;
	
	let familyName = 'Family';
	try {
		const family = await db.select({ name: families.name }).from(families).where(eq(families.id, familyId)).limit(1);
		if (family[0]) {
			familyName = family[0].name;
		}
	} catch (e) {
		console.error('Error fetching family name:', e);
	}

	return {
		familyId,
		familyName
	};
};
