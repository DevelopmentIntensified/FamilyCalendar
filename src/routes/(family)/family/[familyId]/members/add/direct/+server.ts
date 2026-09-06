import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { familyMembers, users } from '$lib/server/db/schema';
import { getFamilyMemberRole, getUserFamilies } from '$lib/server/db/actions/families';
import { createNotification } from '$lib/server/db/actions/notifications';
import { canAddFamilyMember } from '$lib/server/services/subscriptionService';
import { eq, and } from 'drizzle-orm';

/** Only the creator or an admin may add members directly. */
const ADDER_ROLES = new Set(['creator', 'admin']);

/** True when the body field is a non-empty string user id. */
function isNonEmptyUserId(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0;
}

export const POST: RequestHandler = async ({ request, locals, params }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const body = await request.json();
	const { userId } = body;

	if (!isNonEmptyUserId(userId)) {
		return json({ error: 'User ID is required' }, { status: 400 });
	}

	const familyId = params.familyId;
	if (!familyId) {
		return json({ error: 'Family ID is required' }, { status: 400 });
	}

	const userFamilies = await getUserFamilies(locals.user.id);
	if (!userFamilies || userFamilies.families?.id !== familyId) {
		return json(
			{ error: 'You do not have permission to add members to this family' },
			{ status: 403 }
		);
	}

	// Adding a member silently, without the target's consent, is an admin-level
	// action — a plain member must use the invite flow instead.
	const callerRole = await getFamilyMemberRole(locals.user.id, familyId);
	if (!callerRole || !ADDER_ROLES.has(callerRole)) {
		return json(
			{ error: 'Only the family creator or an admin can add members directly' },
			{ status: 403 }
		);
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

	const limitCheck = await canAddFamilyMember(familyId);
	if (!limitCheck.allowed) {
		return json({ error: limitCheck.reason ?? 'This family is full' }, { status: 403 });
	}

	await db.insert(familyMembers).values({
		userId,
		familyId
	});

	const actorName = `${locals.user.firstName} ${locals.user.lastName}`.trim();
	await createNotification({
		userId,
		type: 'added_to_family',
		actorName,
		message: `${actorName} added you to the family.`,
		link: `/family/${familyId}`
	});

	return json({ success: true });
};
