import { json } from '@sveltejs/kit';
import { apiError } from '$lib/server/utils/apiError';
import type { RequestHandler } from './$types';
import {
	generateInviteCode,
	verifyInviteCode,
	deleteInviteCode,
	getFamilyMemberRole
} from '$lib/server/db/actions/families';
import { db } from '$lib/server/db';
import { familyMembers, familyInviteCodes } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { clampCount } from '$lib/server/utils/clampCount';

// Minting or revoking invite codes is an admin-level action — mirrors the
// direct-add gate in members/add/direct.
const INVITE_MANAGER_ROLES = new Set(['creator', 'admin']);

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const body = await request.json();
	const { familyId, expiresInDays, maxUses } = body;

	// Membership + role in THIS family. The old check compared the family id in
	// the body against the user's first `familyMembers` row, so a creator of a
	// second family was refused here (issue 098).
	const callerRole = await getFamilyMemberRole(locals.user.id, familyId);
	if (!callerRole) {
		return json({ error: 'You are not a member of this family' }, { status: 403 });
	}
	if (!INVITE_MANAGER_ROLES.has(callerRole)) {
		return json(
			{ error: 'Only the family creator or an admin can create invitations' },
			{ status: 403 }
		);
	}

	try {
		const inviteCode = await generateInviteCode(familyId, {
			expiresInDays: clampCount(expiresInDays, 1, 30, 7),
			maxUses: clampCount(maxUses, 1, 50, 10),
			createdBy: locals.user.id
		});

		return json({
			code: inviteCode.code,
			expiresAt: inviteCode.expiresAt,
			inviteUrl: `/family/join/${inviteCode.code}`
		});
	} catch (error) {
		console.error('Error generating invite code:', error);
		return apiError(
			new URL(request.url).pathname,
			500,
			'Failed to generate invite code',
			locals.user?.id ?? null
		);
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
				and(eq(familyMembers.userId, locals.user.id), eq(familyMembers.familyId, result.family.id))
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

	const [invite] = await db
		.select()
		.from(familyInviteCodes)
		.where(eq(familyInviteCodes.code, code));
	if (!invite) {
		return json({ error: 'Invite code not found' }, { status: 404 });
	}

	const callerRole = await getFamilyMemberRole(locals.user.id, invite.familyId);
	if (!callerRole) {
		return json({ error: 'You are not a member of this family' }, { status: 403 });
	}
	if (!INVITE_MANAGER_ROLES.has(callerRole)) {
		return json(
			{ error: 'Only the family creator or an admin can revoke invitations' },
			{ status: 403 }
		);
	}

	await deleteInviteCode(code);
	return json({ success: true });
};
