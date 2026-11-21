/**
 * family invites services: listing a family's codes, minting and revoking one,
 * previewing a pasted link, and accepting a code.
 *
 * Authorization lives here (the mint/revoke doors are creator/admin with their
 * own copy; listing hides the codes from a plain member; the preview needs no
 * session). The accept runs ONE transaction that takes `SELECT … FOR UPDATE` on
 * the invite row, then checks expiry, the use cap, duplicate membership and the
 * family-size cap, and bumps `use_count` DB-side (#155). Time comes from
 * `ctx.clock` and the code from the kernel's `systemIds` (the legacy
 * `generateId(10)` shape the frozen golden pins: 10 chars of a-z0-9), so
 * nothing here reads a clock or invents a second alphabet.
 *
 * Doc: ./README.md#public-interface
 */
import type { Actor } from '$lib/kernel/ctx/actor';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import { withTx } from '$lib/kernel/db/database.server';
import { invalid, notFound } from '$lib/kernel/errors/appError';
import { systemIds } from '$lib/kernel/ids/ids';
import type {
	FamilyInvitationsPage,
	FamilyView,
	InviteCodeView,
	MintInviteBody
} from './family.contract';
import { findFamilyById, listMemberships } from './family.families.repo.server';
import { familyMemberLimitRefusal } from './family.families.service.server';
import {
	INVITE_CODE_LENGTH,
	inviteExpiresAt,
	inviteRefusalCopy,
	isInviteUsable,
	shareInvitePlan,
	type InviteMintPlan
} from './family.invites.rules';
import {
	deleteInviteCode,
	findInviteCode,
	findInviteCodeForUpdate,
	incrementInviteUse,
	insertInviteCode,
	listInviteCodes
} from './family.invites.repo.server';
import { managerRefusal } from './family.members.rules';
import { findMemberRole, findMembership, insertMembership } from './family.members.repo.server';
import {
	canManageInvites,
	DEFAULT_FAMILY_ROLE,
	DEFAULT_MEMBER_TYPE,
	familyRefusalError
} from './family.roles.rules';

/** The one 400 the three code-taking doors answer for an absent or blank code. */
const INVITE_CODE_REQUIRED_MESSAGE = 'Invite code is required';

/** The one 404 for a code that is not there, expired, used up or orphaned. */
const INVITE_UNUSABLE_MESSAGE = 'Invalid or expired invite code';

/** A freshly minted code: its text and the instant it lapses. */
export type MintedInviteCode = {
	readonly code: string;
	readonly expiresAt: Date;
};

/** `GET /api/families/{id}/invite-codes`: the rail's answer, empty for a plain member. */
export type FamilyInviteList = {
	readonly canManageInvites: boolean;
	readonly codes: InviteCodeView[];
};

/** `POST /api/family/invite`'s answer: the code, its deadline and the join path. */
export type FamilyMintedInvite = MintedInviteCode & {
	readonly inviteUrl: string;
};

/** `GET /api/family/invite`: the invite's public face and whether you are already in. */
export type FamilyInvitePreview = {
	readonly family: FamilyView;
	readonly isAlreadyMember: boolean;
};

/**
 * Store one code for `familyId` with `plan`'s validity and use cap, stamped by
 * `ctx.clock`. The one mint behind the emailed invite, the shareable link and
 * the `/api/family/invite` door.
 */
export async function mintFamilyInviteCode(
	ctx: Ctx,
	familyId: string,
	plan: InviteMintPlan,
	createdBy: string
): Promise<MintedInviteCode> {
	const code = systemIds.id(INVITE_CODE_LENGTH);
	const expiresAt = inviteExpiresAt(ctx.clock.now(), plan.days);
	await insertInviteCode(ctx.db, { code, familyId, expiresAt, maxUses: plan.maxUses, createdBy });
	return { code, expiresAt };
}

/**
 * `GET /api/families/{id}/invite-codes`: a member of THAT family only (any
 * other answer is one 404, so ids cannot be probed), and the codes are listed
 * to a creator/admin alone — a plain member gets `canManageInvites: false`
 * with an empty list.
 */
export async function listInvites(
	ctx: Ctx,
	actor: Actor,
	familyId: string
): Promise<FamilyInviteList> {
	const role = await findMemberRole(ctx.db, actor.id, familyId);
	if (!role) throw notFound('Family not found');
	const allowed = canManageInvites(role);
	return {
		canManageInvites: allowed,
		codes: allowed ? await listInviteCodes(ctx.db, familyId) : []
	};
}

/**
 * `load` for `/family/invitations`: the family named by `?familyId=` when the
 * caller belongs to it, otherwise the OLDEST one (issue 098); a plain member
 * gets the explanatory notice with no codes, and the switcher carries every
 * family with its own permission. No family at all answers an empty page.
 */
export async function getInvitationsPage(
	ctx: Ctx,
	actor: Actor,
	requestedFamilyId: string | null
): Promise<FamilyInvitationsPage> {
	const memberships = await listMemberships(ctx.db, actor.id);
	const chosen =
		memberships.find((membership) => membership.family.id === requestedFamilyId) ??
		memberships[0] ??
		null;
	if (!chosen) {
		return {
			invitations: [],
			canManageInvites: false,
			family: null,
			now: ctx.clock.now().toISOString(),
			memberships: []
		};
	}
	const allowed = canManageInvites(chosen.role);
	return {
		invitations: allowed ? await listInviteCodes(ctx.db, chosen.family.id) : [],
		canManageInvites: allowed,
		family: chosen.family,
		now: ctx.clock.now().toISOString(),
		memberships: memberships.map((membership) => ({
			id: membership.family.id,
			name: membership.family.name,
			canManageInvites: canManageInvites(membership.role)
		}))
	};
}

/**
 * `POST /api/family/invite`: creator/admin of the family named in the body,
 * then the clamped validity and use cap. Answers the code, its deadline and the
 * join path; a storage failure is the endpoint's 500.
 */
export async function mintInvite(
	ctx: Ctx,
	actor: Actor,
	body: MintInviteBody
): Promise<FamilyMintedInvite> {
	const gate = managerRefusal('mint', await findMemberRole(ctx.db, actor.id, body.familyId));
	if (gate) throw familyRefusalError(gate);

	const minted = await mintFamilyInviteCode(
		ctx,
		body.familyId,
		shareInvitePlan(body.expiresInDays, body.maxUses),
		actor.id
	);
	return { ...minted, inviteUrl: `/family/join/${minted.code}` };
}

/**
 * `DELETE /api/family/invite`: look the code up first (an unknown code is
 * `Invite code not found`), then the family's creator/admin may delete it.
 */
export async function revokeInvite(ctx: Ctx, actor: Actor, code: string): Promise<void> {
	if (!code) throw invalid(INVITE_CODE_REQUIRED_MESSAGE);

	const invite = await findInviteCode(ctx.db, code);
	if (!invite) throw notFound('Invite code not found');

	const gate = managerRefusal('revoke', await findMemberRole(ctx.db, actor.id, invite.familyId));
	if (gate) throw familyRefusalError(gate);

	await deleteInviteCode(ctx.db, code);
}

/**
 * `GET /api/family/invite`: a pasted code's family and whether the caller is
 * already in it. Unknown, expired, used-up and orphaned codes are ONE 404;
 * opening a link never spends a use.
 */
export async function previewInvite(
	ctx: Ctx,
	actor: Actor | null,
	code: string
): Promise<FamilyInvitePreview> {
	if (!code) throw invalid(INVITE_CODE_REQUIRED_MESSAGE);

	const invite = await findInviteCode(ctx.db, code);
	if (!invite || !isInviteUsable(invite, ctx.clock.now())) throw notFound(INVITE_UNUSABLE_MESSAGE);
	const family = await findFamilyById(ctx.db, invite.familyId);
	if (!family) throw notFound(INVITE_UNUSABLE_MESSAGE);

	return {
		family,
		isAlreadyMember: actor ? (await findMembership(ctx.db, actor.id, family.id)) !== null : false
	};
}

/**
 * `POST /api/family/join`: the accept path. One transaction, locked on the
 * invite row, so the use cap, duplicate-member and family-size checks are all
 * evaluated against a state no other accept can change; the use count is bumped
 * by Postgres. Every refusal but the size cap is the same 400.
 */
export async function joinFamily(ctx: Ctx, actor: Actor, code: string): Promise<void> {
	if (!code) throw invalid(INVITE_CODE_REQUIRED_MESSAGE);

	await withTx(ctx, async (txCtx) => {
		const invite = await findInviteCodeForUpdate(txCtx.db, code);
		if (!invite || !isInviteUsable(invite, txCtx.clock.now())) {
			throw familyRefusalError(inviteRefusalCopy({ accepted: false }));
		}
		const family = await findFamilyById(txCtx.db, invite.familyId);
		if (!family) throw familyRefusalError(inviteRefusalCopy({ accepted: false }));
		if (await findMembership(txCtx.db, actor.id, family.id)) {
			throw familyRefusalError(inviteRefusalCopy({ accepted: false }));
		}

		const full = await familyMemberLimitRefusal(txCtx, actor, family.id);
		if (full) throw familyRefusalError(inviteRefusalCopy({ accepted: false, reason: 'family-full' }));

		await insertMembership(txCtx.db, {
			userId: actor.id,
			familyId: family.id,
			role: DEFAULT_FAMILY_ROLE,
			memberType: DEFAULT_MEMBER_TYPE
		});
		await incrementInviteUse(txCtx.db, code);
	});
}
