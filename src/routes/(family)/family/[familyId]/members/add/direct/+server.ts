import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { familyMembers, users } from '$lib/server/db/schema';
import { getUserFamilies } from '$lib/server/db/actions/families';
import { eq, and } from 'drizzle-orm';

export const POST: RequestHandler = async ({ request, locals, params }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const body = await request.json();
	const { userId } = body;

	const familyId = params.familyId;
	if (!familyId) {
		return json({ error: 'Family ID is required' }, { status: 400 });
	}

	const userFamilies = await getUserFamilies(locals.user.id);
	if (!userFamilies || userFamilies.families?.id !== familyId) {
		return json({ error: 'You do not have permission to add members to this family' }, { status: 403 });
	}

	const [existingUser] = await db.select().from(users).where(eq(users.id, userId));
	if (!existingUser) {
		return json({ error: 'User not found' }, { status: 404 });
	}

	const [existingMember] = await db
		.select()
		.from(familyMembers)
		.where(and(eq(familyMembers.userId, userId), eq(familyMembers.familyId, familyId)));

	if (existingMember) {
		return json({ error: 'User is already a member of this family' }, { status: 400 });
	}

	await db.insert(familyMembers).values({
		userId,
		familyId
	});

	return json({ success: true });
};