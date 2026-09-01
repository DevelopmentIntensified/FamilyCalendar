import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { familyMembers } from '$lib/server/db/schema';
import { getUserFamilies } from '$lib/server/db/actions/families';
import { emailExists } from '$lib/server/db/actions/users';
import { createNewUser } from '$lib/server/utils/createNewUser';
import { eq, and } from 'drizzle-orm';

/**
 * Create a child member from the parent's (logged-in) account.
 *
 * The parent supplies the child's name + an email (the child's own, or one the
 * parent controls). We create a real user account for the child (email-verified,
 * magic-link/password sign-in capable) and add them to the family as a member
 * with memberType='child' — which powers the Kids' Schedule.
 *
 * Because users.email is UNIQUE, the child must have an email that isn't already
 * attached to another account. If it is, we reject with a clear message.
 */
export const POST: RequestHandler = async ({ request, locals, params }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
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

	const body = await request.json().catch(() => ({}));
	const { firstName, lastName, email } = body ?? {};

	if (!firstName || !firstName.trim()) {
		return json({ error: 'First name is required' }, { status: 400 });
	}
	if (!lastName || !lastName.trim()) {
		return json({ error: 'Last name is required' }, { status: 400 });
	}
	if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		return json({ error: 'A valid email is required' }, { status: 400 });
	}

	const cleanEmail = email.trim().toLowerCase();

	// users.email is UNIQUE — a child account cannot share another account's
	// email (including the parent's own). Reject early with a clear message.
	if (await emailExists(cleanEmail)) {
		return json(
			{ error: 'That email is already in use. Each child needs their own email address.' },
			{ status: 400 }
		);
	}

	// Create the child's account (user + email account + settings + calendar),
	// then attach them to the family as a memberType='child' member.
	const user = await createNewUser(firstName.trim(), lastName.trim(), cleanEmail);

	const [existingMember] = await db
		.select()
		.from(familyMembers)
		.where(and(eq(familyMembers.userId, user.id), eq(familyMembers.familyId, familyId)));

	if (existingMember) {
		return json({ error: 'This child is already a member of the family' }, { status: 400 });
	}

	await db.insert(familyMembers).values({
		userId: user.id,
		familyId,
		memberType: 'child'
	});

	return json({
		success: true,
		user: { id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email }
	});
};
