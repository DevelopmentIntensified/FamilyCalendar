import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { families } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { getFamilyMemberRole } from '$lib/server/db/actions/families';

// Email-invite/link minting is creator/admin-only (same gate as the email
// endpoints); the page hides the invite tab for plain members.
const INVITE_SENDER_ROLES = new Set(['creator', 'admin']);

export const load: PageServerLoad = async (event) => {
	const familyId = event.params.familyId;

	let familyName = 'Family';
	try {
		const family = await db.select().from(families).where(eq(families.id, familyId)).limit(1);
		if (family[0]) {
			familyName = family[0].name;
		}
	} catch (e) {
		console.error('Error fetching family name:', e);
	}

	const role = event.locals?.user
		? await getFamilyMemberRole(event.locals.user.id, familyId)
		: null;

	return {
		familyId,
		familyName,
		canInviteByEmail: role !== null && INVITE_SENDER_ROLES.has(role)
	};
};
