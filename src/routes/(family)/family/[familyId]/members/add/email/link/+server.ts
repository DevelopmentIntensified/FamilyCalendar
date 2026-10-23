import { json, type RequestEvent } from '@sveltejs/kit';
import { EMAILSECRET } from '$env/static/private';
import { getUrl } from '$lib/utils/getUrl';
import { createJWT } from 'oslo/jwt';
import { TimeSpan } from 'oslo';
import { rateLimit, clientKey } from '$lib/server/utils/rateLimit';
import { db } from '$lib/server/db';
import { familyMembers } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import {
	getFamilyMemberRole,
	generateInviteCode,
	DEFAULT_INVITE_MAX_USES
} from '$lib/server/db/actions/families';

// Shareable invite links carry the same join token as email invites — the
// same admin-level gate applies (mirror of members/add/email).
const INVITE_SENDER_ROLES = new Set(['creator', 'admin']);

// IP burst cap for link minting (issue 152). Admin-gated, lower risk.
const INVITE_LINK_LIMIT = 10;
const INVITE_LINK_WINDOW_MS = 15 * 60 * 1000;

export type InviteLinkSendDeps = {
	familyMember: (userId: string, familyId: string) => Promise<{ userId: string } | undefined>;
	familyRole: typeof getFamilyMemberRole;
	generateInviteCode: typeof generateInviteCode;
	createJwt: typeof createJWT;
	jwtSecret: Uint8Array;
};

const defaultDeps: InviteLinkSendDeps = {
	familyMember: async (userId, familyId) => {
		const [member] = await db
			.select({ userId: familyMembers.userId })
			.from(familyMembers)
			.where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.userId, userId)))
			.limit(1);
		return member;
	},
	familyRole: getFamilyMemberRole,
	generateInviteCode,
	createJwt: createJWT,
	jwtSecret: new TextEncoder().encode(EMAILSECRET)
};

export const POST = async (
	event: RequestEvent,
	deps: InviteLinkSendDeps = defaultDeps
): Promise<Response> => {
	if (!event.locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (
		!rateLimit(
			clientKey(event.request, 'invite-link-ip'),
			INVITE_LINK_LIMIT,
			INVITE_LINK_WINDOW_MS
		)
	) {
		return json({ error: 'Too many requests. Try again later.' }, { status: 429 });
	}

	const member = await deps.familyMember(event.locals.user.id, event.params.familyId!);

	if (!member) {
		return json({ error: 'Not a member of this family' }, { status: 403 });
	}

	const callerRole = await deps.familyRole(event.locals.user.id, event.params.familyId!);
	if (!callerRole || !INVITE_SENDER_ROLES.has(callerRole)) {
		return json(
			{ error: 'Only the family creator or an admin can generate invite links' },
			{ status: 403 }
		);
	}

	const rData = await event.request.json();
	const { email, firstName, lastName } = rData;

	const emailRegex =
		/^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

	if (!emailRegex.test(email)) {
		return json({ success: false, error: 'Invalid email' }, { status: 400 });
	} else if (!firstName || !lastName || firstName === '' || lastName === '') {
		return json({ success: false, error: 'First and last name are required' }, { status: 400 });
	}

	// The JWT is stateless, so the shared cap and revocation live in the
	// durable invite row it embeds; the consumer joins through acceptInvite
	// against it (issue 152, mirroring DEFAULT_INVITE_MAX_USES from issue 091).
	const inviteCode = await deps.generateInviteCode(event.params.familyId!, {
		expiresInDays: 1,
		maxUses: DEFAULT_INVITE_MAX_USES,
		createdBy: event.locals.user.id
	});

	const token = await deps.createJwt(
		'HS256',
		deps.jwtSecret,
		{
			email,
			firstName,
			lastName,
			familyId: event.params.familyId,
			inviteCode: inviteCode.code
		},
		{
			headers: {
				alg: 'HS256',
				typ: 'JWT'
			},
			expiresIn: new TimeSpan(1, 'd')
		}
	);

	const siteUrl = getUrl();
	const link = `${siteUrl}/family/invite/email?token=${token}`;

	return json({ success: true, link });
};
