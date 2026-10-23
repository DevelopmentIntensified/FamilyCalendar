import { sendEmail } from '$lib/utils/sendEmail';
import { json, type RequestEvent } from '@sveltejs/kit';
import { NOREPLYEMAIL, EMAILSECRET } from '$env/static/private';
import { getUrl } from '$lib/utils/getUrl';
import { createJWT } from 'oslo/jwt';
import { TimeSpan } from 'oslo';
import { rateLimit, clientKey } from '$lib/server/utils/rateLimit';
import { db } from '$lib/server/db';
import { familyMembers } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { getFamilyMemberRole, generateInviteCode } from '$lib/server/db/actions/families';
import { getFamilyInviteEmailHtml } from '$lib/server/emails/family-invite';

// Sending email invites mints a join token for the family — an admin-level
// action, mirroring the direct-add gate in members/add/direct.
const INVITE_SENDER_ROLES = new Set(['creator', 'admin']);

// IP burst cap for the send endpoint (issue 152). The route is admin-gated,
// so this caps repeat sends rather than anonymous abuse.
const INVITE_EMAIL_LIMIT = 10;
const INVITE_EMAIL_WINDOW_MS = 15 * 60 * 1000;

export type emailTokenPayloadType = {
	email: string;
	firstName: string;
	lastName: string;
	familyId: string;
	inviteCode: string;
};

export type InviteEmailSendDeps = {
	familyMember: (userId: string, familyId: string) => Promise<{ userId: string } | undefined>;
	familyRole: typeof getFamilyMemberRole;
	generateInviteCode: typeof generateInviteCode;
	createJwt: typeof createJWT;
	sendEmail: typeof sendEmail;
	// Issue 091 — the body is rendered outside the handler, through the same
	// dependency-injection seam as the magic-link service.
	renderEmail: typeof getFamilyInviteEmailHtml;
	jwtSecret: Uint8Array;
};

const defaultDeps: InviteEmailSendDeps = {
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
	sendEmail,
	renderEmail: getFamilyInviteEmailHtml,
	jwtSecret: new TextEncoder().encode(EMAILSECRET)
};

export const POST = async (
	event: RequestEvent,
	deps: InviteEmailSendDeps = defaultDeps
): Promise<Response> => {
	if (!event.locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (
		!rateLimit(
			clientKey(event.request, 'invite-email-ip'),
			INVITE_EMAIL_LIMIT,
			INVITE_EMAIL_WINDOW_MS
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
			{ error: 'Only the family creator or an admin can send invitations' },
			{ status: 403 }
		);
	}

	const rData = await event.request.json();
	const { email, firstName, lastName } = rData;
	const user = event.locals.user;

	const emailRegex =
		/^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

	if (!emailRegex.test(email)) {
		return new Response(JSON.stringify({ success: false, error: 'Invalid email' }), {
			status: 400
		});
	} else if (!firstName || !lastName || firstName === '' || lastName === '') {
		return new Response(
			JSON.stringify({ success: false, error: 'First and last name are required' }),
			{ status: 400 }
		);
	}

	// The emailed JWT is stateless, so single-use and revocation live in the
	// durable invite row it embeds: one single-use row per send, and the
	// consumer joins through acceptInvite against it (issue 152).
	const inviteCode = await deps.generateInviteCode(event.params.familyId!, {
		expiresInDays: 1,
		maxUses: 1,
		createdBy: user.id
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

	const signInUrl = new URL(getUrl());
	signInUrl.pathname = '/family/invite/email';
	signInUrl.searchParams.set('token', token);

	const { success } = await deps.sendEmail({
		to: email,
		from: NOREPLYEMAIL,
		subject: 'You have been invited to join a family by ' + user.firstName + ' ' + user.lastName,
		html: deps.renderEmail({
			inviterName: user.firstName + ' ' + user.lastName,
			inviteUrl: signInUrl.toString()
		})
	});

	if (success) {
		return new Response(JSON.stringify({ success: true }), { status: 200 });
	}
	return new Response(
		JSON.stringify({ success: false, error: 'There was an error. Please try again.' }),
		{ status: 500 }
	);
};
