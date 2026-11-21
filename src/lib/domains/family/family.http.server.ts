/**
 * family http: the eighteen `/api` handlers over the module's services.
 *
 * One file, because the S2 golden `family.http.db.test.ts` is the module's
 * contract test and rule R13 ties a test to the file with the same stem — the
 * shape every other ported module uses (identity, alerts, feedback).
 *
 * Reproduces the legacy wire exactly: auth mode, rate-limit scope (the same
 * `${scope}:${ip}` keys legacy used), statuses, bodies and error copy. No SQL
 * and no rules — the services own both. Bodies are mapped to the contract's wire
 * types by hand, so a handler's static body type IS the wire type while the
 * goldens still read ISO strings (`toInstantString`).
 *
 * The endpoint builder types `ctx` as the kernel `Ctx`; the app attaches this
 * module's five ports (and identity's two, for the settings read) to every ctx
 * in `src/lib/app/ports.server.ts`. The narrowing helpers fail loudly when the
 * wiring is missing rather than reading through `undefined`.
 *
 * Doc: ./README.md#public-interface
 */
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import { isAppError } from '$lib/kernel/errors/appError';
import { created, endpoint, ok, reply } from '$lib/kernel/http/endpoint.server';
import { LOGIN_PATH, formAction, pageLoad } from '$lib/kernel/http/pageHandlers.server';
import { toInstantString } from '$lib/kernel/time/dates';
import { fail, redirect } from '@sveltejs/kit';
import {
	AddChildBody,
	AddDirectBody,
	CreateFamilyBody,
	CreateFamilyFormBody,
	FamilyDoorParams,
	FamilyMemberParams,
	FamilyParams,
	FamilySearchQuery,
	InviteCodeBody,
	InvitePreviewQuery,
	InviteTargetBody,
	MemberPatchBody,
	MemberSearchQuery,
	MintInviteBody,
	RosterQuery,
	UpdateFamilyBody,
	type ChildAddedResponse,
	type CreateFamilyResponse,
	type FamilyAddMemberPage,
	type FamilyCardResponse,
	type FamilyCardView,
	type FamilyCreateFormEcho,
	type FamilyCreatePage,
	type FamilyDetailResponse,
	type FamilyDetailView,
	type FamilyInvitationsPage,
	type FamilyJoinPage,
	type FamilyOverviewResponse,
	type FamilyResponse,
	type FamilyRosterRowResponse,
	type FamilySearchResponse,
	type FamilyView,
	type InviteCodeResponse,
	type InviteCodeView,
	type InviteCodesResponse,
	type InviteLinkResponse,
	type InvitePreviewResponse,
	type InviteSentResponse,
	type MemberSearchResponse,
	type MemberUpdatedResponse,
	type MintInviteResponse,
	type RosterMemberResponse,
	type RosterResponse,
	type UpdateFamilyResponse
} from './family.contract';
import {
	createFamily,
	getFamily,
	getFamilyCreatePage,
	listFamilies,
	updateFamily,
	type FamilyListPayload
} from './family.families.service.server';
import {
	getInvitationsPage,
	joinFamily,
	listInvites,
	mintInvite,
	previewInvite,
	revokeInvite
} from './family.invites.service.server';
import {
	FAMILY_INVITE_SEND_FAILED_MESSAGE,
	addChildMember,
	addMemberDirectly,
	changeMember,
	getAddMemberPage,
	mintFamilyInviteLink,
	removeFamilyMember,
	sendFamilyInvite
} from './family.members.service.server';
import { findInvitableMembers, listFamilyRoster, searchMembers } from './family.search.service.server';
import type { FamilyCtx, FamilyDetailCtx } from './index.server';

/** A required wire timestamp; a stored `Date` is always valid, anything else is a fault. */
function instant(value: Date): string {
	const text = toInstantString(value);
	if (text === null) throw new Error('family http: invalid timestamp');
	return text;
}

/** A family row on the wire. */
function familyWire(family: FamilyView): FamilyResponse {
	return {
		id: family.id,
		name: family.name,
		color: family.color,
		createdAt: instant(family.createdAt)
	};
}

/** One code as the invitations rail shows it. */
function inviteWire(invite: InviteCodeView): InviteCodeResponse {
	return {
		code: invite.code,
		useCount: invite.useCount ?? 0,
		maxUses: invite.maxUses,
		expiresAt: instant(invite.expiresAt),
		createdBy: invite.createdBy ?? null
	};
}

/** One `/family` card. */
function cardWire(card: FamilyCardView): FamilyCardResponse {
	return {
		...familyWire(card),
		memberCount: card.memberCount,
		openTasks: card.openTasks,
		members: card.members.map((member) => ({
			firstName: member.firstName,
			userId: member.userId
		})),
		createdLabel: card.createdLabel,
		canInvite: card.canInvite,
		role: card.role
	};
}

/** One roster row (the list's rows carry no email; the detail's do). */
function rosterWire(member: RosterMemberResponse): RosterMemberResponse {
	return {
		userId: member.userId,
		firstName: member.firstName,
		lastName: member.lastName,
		email: member.email,
		role: member.role,
		memberType: member.memberType
	};
}

/** `GET /api/families`'s body. */
function overviewWire(payload: FamilyListPayload): FamilyOverviewResponse {
	return {
		families: payload.families.map(cardWire),
		roster: payload.roster.map(
			(row): FamilyRosterRowResponse => ({
				familyId: row.familyId,
				userId: row.userId,
				firstName: row.firstName,
				lastName: row.lastName,
				role: row.role,
				memberType: row.memberType
			})
		),
		activeInvites: payload.activeInvites.map((invite) => ({
			familyId: invite.familyId,
			code: invite.code,
			useCount: invite.useCount,
			maxUses: invite.maxUses,
			expiresAt: instant(invite.expiresAt)
		})),
		plan: payload.plan
	};
}

/** `GET /api/families/{id}`'s body. */
function detailWire(detail: FamilyDetailView): FamilyDetailResponse {
	return {
		family: familyWire(detail.family),
		members: detail.members.map(rosterWire),
		currentUserRole: detail.currentUserRole,
		currentUserId: detail.currentUserId,
		activity: detail.activity,
		// The port answers all four family-scoped switches; a missing key stays default-on.
		moduleSwitches: {
			board: detail.moduleSwitches.board ?? true,
			kids: detail.moduleSwitches.kids ?? true,
			groceries: detail.moduleSwitches.groceries ?? true,
			meals: detail.moduleSwitches.meals ?? true
		},
		hiddenDashboardModules: detail.hiddenDashboardModules,
		activeInvite: detail.activeInvite
			? {
					code: detail.activeInvite.code,
					useCount: detail.activeInvite.useCount,
					maxUses: detail.activeInvite.maxUses,
					expiresAt: instant(detail.activeInvite.expiresAt)
				}
			: null,
		inviteCreatedBy: detail.inviteCreatedBy,
		planUsage: detail.planUsage
	};
}

/** The ctx every family service that crosses a module boundary needs. */
function familyCtx(ctx: Ctx): FamilyCtx {
	if (
		!('calendar' in ctx) ||
		!('tasks' in ctx) ||
		!('moduleSwitches' in ctx) ||
		!('childAccount' in ctx) ||
		!('inviteLink' in ctx)
	) {
		throw new Error(
			'family ports are not wired: src/lib/app/ports.server.ts must attach calendar, tasks, moduleSwitches, childAccount and inviteLink'
		);
	}
	return ctx as FamilyCtx;
}

/** `getFamily` also reads through identity's settings service, which needs identity's ports. */
function familyDetailCtx(ctx: Ctx): FamilyDetailCtx {
	if (!('calendarAccess' in ctx) || !('adConsent' in ctx)) {
		throw new Error(
			'identity settings ports are not wired: src/lib/app/ports.server.ts must attach calendarAccess and adConsent'
		);
	}
	return familyCtx(ctx) as FamilyDetailCtx;
}

// --- Families -----------------------------------------------------------------

/** `GET /api/families`: the `/family` list. */
export const listFamiliesEndpoint = endpoint({
	auth: 'user',
	handle: async ({ ctx, actor }) => ok(overviewWire(await listFamilies(ctx, actor)))
});

/**
 * `POST /api/families`: 201 `{family}`, or the plan gate's 403 with
 * `upgradeRequired`, or `Failed to create family` on a storage failure.
 */
export const createFamilyEndpoint = endpoint({
	auth: 'user',
	body: CreateFamilyBody,
	failMessage: 'Failed to create family',
	handle: async ({ ctx, actor, body }) => {
		const family = await createFamily(familyCtx(ctx), actor, body);
		const response: CreateFamilyResponse = { family: familyWire(family) };
		return created(response);
	}
});

/** `GET /api/families/{id}`: the family detail page's payload. */
export const getFamilyEndpoint = endpoint({
	auth: 'user',
	params: FamilyParams,
	handle: async ({ ctx, actor, params }) =>
		ok(detailWire(await getFamily(familyDetailCtx(ctx), actor, params.id)))
});

/** `PATCH /api/families/{id}`: `200 {success, family}`; absent fields are unchanged. */
export const updateFamilyEndpoint = endpoint({
	auth: 'user',
	params: FamilyParams,
	body: UpdateFamilyBody,
	handle: async ({ ctx, actor, params, body }) => {
		const family = await updateFamily(ctx, actor, params.id, body);
		const response: UpdateFamilyResponse = { success: true, family: familyWire(family) };
		return ok(response);
	}
});

/** `GET /api/families/{id}/invite-codes`: the rail's codes, hidden from a plain member. */
export const listInviteCodesEndpoint = endpoint({
	auth: 'user',
	params: FamilyParams,
	handle: async ({ ctx, actor, params }) => {
		const page = await listInvites(ctx, actor, params.id);
		const response: InviteCodesResponse = {
			canManageInvites: page.canManageInvites,
			codes: page.codes.map(inviteWire)
		};
		return ok(response);
	}
});

// --- Members ------------------------------------------------------------------

/** The shared 200 body of the member PATCH, the direct add and the DELETE. */
const MEMBER_UPDATED: MemberUpdatedResponse = { success: true };

/** The 429 copy both invite doors answer with (legacy `INVITE_*_LIMIT`). */
const TOO_MANY_INVITES = 'Too many requests. Try again later.';

/** Ten mint/send calls per IP per fifteen minutes, checked after auth (issue 152). */
const INVITE_IP_RULE = { limit: 10, windowMs: 15 * 60 * 1000, message: TOO_MANY_INVITES } as const;

/** `PATCH /api/families/{id}/members/{userId}`: `{success:true}` or the first refusal. */
export const changeMemberEndpoint = endpoint({
	auth: 'user',
	params: FamilyMemberParams,
	body: MemberPatchBody,
	handle: async ({ ctx, actor, params, body }) => {
		await changeMember(ctx, actor, {
			familyId: params.id,
			userId: params.userId,
			role: body.role,
			memberType: body.memberType
		});
		return ok(MEMBER_UPDATED);
	}
});

/** `DELETE /api/families/{id}/members/{userId}`: `{success:true}`, idempotent for a non-member. */
export const removeMemberEndpoint = endpoint({
	auth: 'user',
	params: FamilyMemberParams,
	handle: async ({ ctx, actor, params }) => {
		await removeFamilyMember(familyCtx(ctx), actor, {
			familyId: params.id,
			userId: params.userId
		});
		return ok(MEMBER_UPDATED);
	}
});

/** `POST /api/families/{id}/members/direct`: adds one existing account and alerts them. */
export const addDirectEndpoint = endpoint({
	auth: 'user',
	params: FamilyDoorParams,
	body: AddDirectBody,
	bodyMode: 'lenient',
	handle: async ({ ctx, actor, params, body }) => {
		await addMemberDirectly(familyCtx(ctx), actor, {
			familyId: params.id ?? params.familyId ?? '',
			userId: body.userId ?? ''
		});
		return ok(MEMBER_UPDATED);
	}
});

/**
 * `POST /api/families/{id}/members/child`: creates the child's real account,
 * a `child` membership and the append-only consent record, answering the user
 * row the page shows.
 */
export const addChildEndpoint = endpoint({
	auth: 'user',
	params: FamilyDoorParams,
	body: AddChildBody,
	bodyMode: 'lenient',
	handle: async ({ ctx, actor, params, body }) => {
		const user = await addChildMember(familyCtx(ctx), actor, {
			familyId: params.id ?? params.familyId ?? '',
			firstName: body.firstName,
			lastName: body.lastName,
			email: body.email,
			consentAcknowledged: body.consentAcknowledged
		});
		const response: ChildAddedResponse = {
			success: true,
			user: {
				id: user.id,
				firstName: user.firstName,
				lastName: user.lastName,
				email: user.email
			}
		};
		return ok(response);
	}
});

/**
 * `POST /api/families/{id}/members/email`: mints one single-use 1-day code and
 * emails the signed link. A provider refusal is the legacy 500 body
 * `{success:false, error}`; the invite row stays minted, as it did there.
 */
export const sendInviteEmailEndpoint = endpoint({
	auth: 'user',
	params: FamilyDoorParams,
	body: InviteTargetBody,
	bodyMode: 'lenient',
	rateLimit: { scope: 'invite-email-ip', ...INVITE_IP_RULE },
	handle: async ({ ctx, actor, params, body }) => {
		const { delivered } = await sendFamilyInvite(familyCtx(ctx), actor, {
			familyId: params.id ?? params.familyId ?? '',
			email: body.email,
			firstName: body.firstName,
			lastName: body.lastName
		});
		if (!delivered) {
			return reply(500, { success: false, error: FAMILY_INVITE_SEND_FAILED_MESSAGE });
		}
		const response: InviteSentResponse = { success: true };
		return ok(response);
	}
});

/**
 * `POST /api/families/{id}/members/email/link`: the same gate and fields,
 * minting the shared 10-use, 1-day code and answering `{success, link}`.
 */
export const mintInviteLinkEndpoint = endpoint({
	auth: 'user',
	params: FamilyDoorParams,
	body: InviteTargetBody,
	bodyMode: 'lenient',
	rateLimit: { scope: 'invite-link-ip', ...INVITE_IP_RULE },
	handle: async ({ ctx, actor, params, body }) => {
		const link = await mintFamilyInviteLink(familyCtx(ctx), actor, {
			familyId: params.id ?? params.familyId ?? '',
			email: body.email,
			firstName: body.firstName,
			lastName: body.lastName
		});
		const response: InviteLinkResponse = { success: true, link };
		return ok(response);
	}
});

// --- Invites ------------------------------------------------------------------

/** The `{success:true}` the revoke and join doors answer. */
const INVITE_ACCEPTED = { success: true } as const;

/**
 * `POST /api/family/invite`: creator/admin of the family in the body, minting a
 * code with the clamped validity (1–30 days, default 7) and uses (1–50,
 * default 10).
 */
export const mintInviteEndpoint = endpoint({
	auth: 'user',
	body: MintInviteBody,
	bodyMode: 'lenient',
	failMessage: 'Failed to generate invite code',
	handle: async ({ ctx, actor, body }) => {
		const minted = await mintInvite(ctx, actor, body);
		const response: MintInviteResponse = {
			code: minted.code,
			expiresAt: instant(minted.expiresAt),
			inviteUrl: minted.inviteUrl
		};
		return ok(response);
	}
});

/**
 * `GET /api/family/invite?code=`: the invite's public face and whether the
 * caller is already a member. An unusable code is one 404; opening it never
 * spends a use.
 */
export const previewInviteEndpoint = endpoint({
	auth: 'optional',
	query: InvitePreviewQuery,
	handle: async ({ ctx, actor, query }) => {
		const preview = await previewInvite(ctx, actor, query.code);
		const response: InvitePreviewResponse = {
			family: {
				id: preview.family.id,
				name: preview.family.name,
				color: preview.family.color
			},
			isAlreadyMember: preview.isAlreadyMember
		};
		return ok(response);
	}
});

/** `DELETE /api/family/invite`: creator/admin of the code's family, `{success:true}`. */
export const revokeInviteEndpoint = endpoint({
	auth: 'user',
	body: InviteCodeBody,
	bodyMode: 'lenient',
	handle: async ({ ctx, actor, body }) => {
		await revokeInvite(ctx, actor, body.code);
		return ok(INVITE_ACCEPTED);
	}
});

/**
 * `POST /api/family/join`: one locked accept transaction; the refusal copy (400
 * for every reason but the size cap, 403 for it) comes from the invites rules.
 */
export const joinFamilyEndpoint = endpoint({
	auth: 'user',
	body: InviteCodeBody,
	bodyMode: 'lenient',
	failMessage: 'Failed to accept invite',
	handle: async ({ ctx, actor, body }) => {
		await joinFamily(ctx, actor, body.code);
		return ok(INVITE_ACCEPTED);
	}
});

// --- Search -------------------------------------------------------------------

/** Twenty searches per five minutes per client: enough to type ahead, not to crawl. */
const MEMBER_SEARCH_RULE = {
	scope: 'family-member-search',
	limit: 20,
	windowMs: 5 * 60 * 1000,
	message: 'Too many searches. Try again shortly.'
} as const;

/**
 * `GET /api/family/member-search?q=&exclude=`: verified prefixes only, the
 * caller and every excluded id left out, ten rows, no ordering, masked emails.
 */
export const memberSearchEndpoint = endpoint({
	auth: 'user',
	query: MemberSearchQuery,
	rateLimit: MEMBER_SEARCH_RULE,
	handle: async ({ ctx, actor, query }) => {
		const users = await searchMembers(ctx, actor, { q: query.q, exclude: query.exclude });
		const response: MemberSearchResponse = { users };
		return ok(response);
	}
});

/**
 * `GET /api/family/roster?familyId=`: one named family needs a membership;
 * without one it answers the caller's oldest family, or an empty answer.
 */
export const rosterEndpoint = endpoint({
	auth: 'user',
	query: RosterQuery,
	handle: async ({ ctx, actor, query }) => {
		const answer = await listFamilyRoster(ctx, actor, query.familyId);
		const response: RosterResponse = {
			familyId: answer.familyId,
			members: answer.members.map(rosterWire)
		};
		return ok(response);
	}
});

/**
 * `GET /api/family/search?q=&familyId=`: a member of that family only, exact
 * match, current members excluded, full addresses (the invite goes there).
 */
export const searchFamilyEndpoint = endpoint({
	auth: 'user',
	query: FamilySearchQuery,
	handle: async ({ ctx, actor, query }) => {
		const users = await findInvitableMembers(ctx, actor, {
			q: query.q,
			familyId: query.familyId
		});
		const response: FamilySearchResponse = { users };
		return ok(response);
	}
});

// --- Page loads and actions --------------------------------------------------
//
// The five `(family)` pages that belong to this module: the list, create, the
// invitations manager, the add-member tabs and the join card. Their data is
// internal (S7 designs it), so only the create form's action is a fixed shape;
// the routes below are wiring only (`export const load = …`).

/** `load` for `/family`: signed in only (302 `/login`), the same payload `GET /api/families` answers. */
export const familyHomePageLoad = pageLoad({
	auth: 'user',
	handle: async ({ ctx, actor }): Promise<FamilyListPayload> => listFamilies(ctx, actor)
});

/** `load` for `/family/create`: the plan gate and both limits, before any form is drawn. */
export const familyCreatePageLoad = pageLoad({
	auth: 'user',
	handle: async ({ ctx, actor }): Promise<FamilyCreatePage> => getFamilyCreatePage(ctx, actor)
});

/**
 * The `/family/create` submit. Legacy order: a signed-out POST goes to
 * `/login` (the page's own gate, not the kernel's 401), then the shared create
 * use-case runs — the plan gate before the form is read, the same copy and
 * `upgradeRequired` on refusal — and success redirects into the new family.
 * A refusal echoes the typed name and colour so the form does not lose them.
 */
export const familyCreateAction = formAction({
	auth: 'optional',
	form: CreateFamilyFormBody,
	handle: async ({ ctx, actor, form }) => {
		if (!actor) redirect(302, LOGIN_PATH);
		try {
			const family = await createFamily(familyCtx(ctx), actor, {
				name: form.name,
				color: form.color,
				memberIds: form.memberIds
			});
			redirect(302, `/family/${family.id}`);
		} catch (cause) {
			if (!isAppError(cause)) throw cause;
			const echo: FamilyCreateFormEcho = cause.extra.upgradeRequired
				? { error: cause.message, upgradeRequired: true }
				: { error: cause.message, name: form.name, color: form.color };
			return fail(cause.status, { success: false, ...echo });
		}
	}
});

/** `load` for `/family/invitations`: `?familyId=` when it is the caller's, else the oldest (issue 098). */
export const familyInvitationsPageLoad = pageLoad({
	auth: 'user',
	handle: async ({ ctx, actor, event }): Promise<FamilyInvitationsPage> =>
		getInvitationsPage(ctx, actor, event.url.searchParams.get('familyId'))
});

/** `load` for `/family/[familyId]/members/add`: the family's name and the invite tab's gate. */
export const familyAddMemberPageLoad = pageLoad({
	auth: 'user',
	handle: async ({ ctx, actor, event }): Promise<FamilyAddMemberPage> =>
		getAddMemberPage(ctx, actor, event.params.familyId ?? '')
});

/**
 * `load` for `/family/join/[code]`: an unusable code (unknown, expired, spent,
 * already a member) is answered in place, never redirected (issue 124).
 */
export const familyJoinPageLoad = pageLoad({
	auth: 'optional',
	handle: async ({ ctx, actor, event }): Promise<FamilyJoinPage> => {
		const code = event.params.code ?? '';
		const isLoggedIn = actor !== null;
		try {
			const preview = await previewInvite(ctx, actor, code);
			return {
				invalid: false,
				family: {
					id: preview.family.id,
					name: preview.family.name,
					color: preview.family.color
				},
				code,
				isLoggedIn
			};
		} catch (cause) {
			if (!isAppError(cause)) throw cause;
			return { invalid: true, family: null, code, isLoggedIn };
		}
	}
});
