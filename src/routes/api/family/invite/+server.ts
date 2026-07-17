import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generateInviteCode, verifyInviteCode, deleteInviteCode } from '$lib/server/db/actions/families';
import { getUserFamilies } from '$lib/server/db/actions/families';
import { db } from '$lib/server/db';
import { familyMembers, familyInviteCodes } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const body = await request.json();
	const { familyId, expiresInDays, maxUses } = body;

	const userFamilies = await getUserFamilies(locals.user.id);
	if (!userFamilies || userFamilies.families?.id !== familyId) {
		return json({ error: 'You do not have permission to invite members to this family' }, { status: 403 });
	}

	try {
		const inviteCode = await generateInviteCode(familyId, {
			expiresInDays: expiresInDays ?? 7,
			maxUses: maxUses ?? 10,
			createdBy: locals.user.id
		});

		return json({
			code: inviteCode.code,
			expiresAt: inviteCode.expiresAt,
			inviteUrl: `/family/join/${inviteCode.code}`
		});
	} catch (error) {
		console.error('Error generating invite code:', error);
		return json({ error: 'Failed to generate invite code' }, { status: 500 });
	}
};

export const GET: RequestHandler = async ({ url, locals }) => {
	const code = url.searchParams.get('code');

	if (!code) {
		return json({ error: 'Invite code is required' }, { status: 400 });
	}

	const result = await verifyInviteCode(code);

	if (!result) {
		return json({ error: 'Invalid or expired invite code' }, { status: 404 });
	}

	let isAlreadyMember = false;
	if (locals.user) {
		const [member] = await db
			.select()
			.from(familyMembers)
			.where(
				and(
					eq(familyMembers.userId, locals.user.id),
					eq(familyMembers.familyId, result.family.id)
				)
			);
		isAlreadyMember = !!member;
	}

	return json({
		family: {
			id: result.family.id,
			name: result.family.name,
			color: result.family.color
		},
		isAlreadyMember
	});
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const body = await request.json();
	const { code } = body;
	if (!code) {
		return json({ error: 'Invite code is required' }, { status: 400 });
	}

	const [invite] = await db.select().from(familyInviteCodes).where(eq(familyInviteCodes.code, code));
	if (!invite) {
		return json({ error: 'Invite code not found' }, { status: 404 });
	}

	const userFamilies = await getUserFamilies(locals.user.id);
	if (!userFamilies || userFamilies.families?.id !== invite.familyId) {
		return json({ error: 'You do not have permission to revoke this invitation' }, { status: 403 });
	}

	await deleteInviteCode(code);
	return json({ success: true });
};
