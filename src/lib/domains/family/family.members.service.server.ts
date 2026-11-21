/**
 * family members services: every way a person joins a family (direct add, the
 * child door, an emailed invite, a shareable link) plus role/Member Type
 * changes and removal.
 *
 * Authorization lives here: each door's own gate comes from
 * `family.members.rules.ts`, so a plain member is refused with that door's
 * copy. The family-size cap is the CREATOR's plan (legacy `canAddFamilyMember`),
 * read through billing; the child's account is
 * `ports.childAccount.createChildAccount`, the invite token
 * `ports.inviteLink.mintInviteLink`, the Alert `alerts.createAlert`, and the
 * removed member's tasks `ports.tasks.unassignMemberTasks`. Time comes from
 * `ctx.clock`, ids from `ctx.ids`.
 *
 * Doc: ./README.md#public-interface
 */
import type { Actor } from '$lib/kernel/ctx/actor';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import { withTx } from '$lib/kernel/db/database.server';
import { forbidden, invalid } from '$lib/kernel/errors/appError';
import { createAlert } from '$lib/domains/alerts/index.server';
import { getPerson, isEmailTaken } from '$lib/domains/identity/index.server';
import type { FamilyAddMemberPage } from './family.contract';
import { findFamilyById } from './family.families.repo.server';
import { familyMemberLimitRefusal } from './family.families.service.server';
import { EMAIL_INVITE_PLAN, LINK_INVITE_PLAN, familyInviteEmailHtml } from './family.invites.rules';
import { mintFamilyInviteCode } from './family.invites.service.server';
import {
	CHILD_EMAIL_TAKEN_MESSAGE,
	addedToFamilyAlert,
	childDetailsRefusal,
	consentRefusal,
	directAddRefusal,
	inviteTargetRefusal,
	managerRefusal,
	memberTypeRefusal,
	removalRefusal,
	roleChangeRefusal
} from './family.members.rules';
import {
	deleteMembership,
	findMemberRole,
	findMembership,
	findUserForAdd,
	insertChildConsent,
	insertMembership,
	updateMemberRole,
	updateMemberType
} from './family.members.repo.server';
import {
	canManageInvites,
	DEFAULT_FAMILY_ROLE,
	DEFAULT_MEMBER_TYPE,
	familyRefusalError,
	type FamilyRole,
	type MemberType
} from './family.roles.rules';
import type { FamilyChildAccountView, FamilyCtx, FamilyInviteLinkInput } from './index.server';

/** The 500 body an emailed invite answers when the provider refused it. */
export const FAMILY_INVITE_SEND_FAILED_MESSAGE = 'There was an error. Please try again.';

/** A direct add: the family named by the URL and the person to put in it. */
export type DirectAddInput = {
	readonly familyId: string;
	readonly userId: string;
};

/** The child form, after the boundary read every field as text. */
export type ChildAddInput = {
	readonly familyId: string;
	readonly firstName: string;
	readonly lastName: string;
	readonly email: string;
	readonly consentAcknowledged: boolean;
};

/** An emailed invite or shareable link: the family, an address and both names. */
export type InviteTargetInput = {
	readonly familyId: string;
	readonly email: string;
	readonly firstName: string;
	readonly lastName: string;
};

/** `PATCH .../members/{userId}`: either field may be absent, never both. */
export type MemberChangeInput = {
	readonly familyId: string;
	readonly userId: string;
	readonly role?: string;
	readonly memberType?: string;
};

/** `DELETE .../members/{userId}`. */
export type MemberRemovalInput = {
	readonly familyId: string;
	readonly userId: string;
};

/**
 * `load` for `/family/[familyId]/members/add`: the family's name for the
 * breadcrumb and whether this caller may send an email invite (the invite tab
 * is hidden, not refused, for a plain member). A missing family answers the
 * legacy 'Family' placeholder rather than a refusal, because the page can
 * still offer "Find someone" and "Create a child".
 */
export async function getAddMemberPage(
	ctx: Ctx,
	actor: Actor,
	familyId: string
): Promise<FamilyAddMemberPage> {
	const family = await findFamilyById(ctx.db, familyId);
	const role = await findMemberRole(ctx.db, actor.id, familyId);
	return {
		familyId,
		familyName: family?.name ?? 'Family',
		canInviteByEmail: canManageInvites(role)
	};
}

/**
 * `POST /api/families/{id}/members/direct`: creator/admin only, the person must
 * exist and not already be in the family, and the family must have room. The
 * membership write and the `added_to_family` Alert to that person follow.
 */
export async function addMemberDirectly(
	ctx: FamilyCtx,
	actor: Actor,
	input: DirectAddInput
): Promise<void> {
	if (!input.userId) throw invalid('User ID is required');
	if (!input.familyId) throw invalid('Family ID is required');

	const gate = managerRefusal('direct', await findMemberRole(ctx.db, actor.id, input.familyId));
	if (gate) throw familyRefusalError(gate);

	const user = await findUserForAdd(ctx.db, input.userId);
	const existing = await findMembership(ctx.db, input.userId, input.familyId);
	const refusal = directAddRefusal({
		userExists: user !== null,
		alreadyMember: existing !== null
	});
	if (refusal) throw familyRefusalError(refusal);

	const full = await familyMemberLimitRefusal(ctx, actor, input.familyId);
	if (full) throw forbidden(full);

	await insertMembership(ctx.db, {
		userId: input.userId,
		familyId: input.familyId,
		role: DEFAULT_FAMILY_ROLE,
		memberType: DEFAULT_MEMBER_TYPE
	});
	const actorPerson = await getPerson(ctx, actor);
	await createAlert(ctx, actor, {
		userId: input.userId,
		...addedToFamilyAlert(actorPerson, input.familyId)
	});
}

/**
 * `POST /api/families/{id}/members/child`: creator/admin only, the family-size
 * cap is checked BEFORE the form (legacy order), then the fields, the unique
 * address and the explicit consent. The child's account is created by
 * `ports.childAccount`; the membership and the append-only consent record are
 * written in one transaction.
 */
export async function addChildMember(
	ctx: FamilyCtx,
	actor: Actor,
	input: ChildAddInput
): Promise<FamilyChildAccountView> {
	if (!input.familyId) throw invalid('Family ID is required');

	const gate = managerRefusal('child', await findMemberRole(ctx.db, actor.id, input.familyId));
	if (gate) throw familyRefusalError(gate);

	const full = await familyMemberLimitRefusal(ctx, actor, input.familyId);
	if (full) throw forbidden(full);

	const details = childDetailsRefusal({
		firstName: input.firstName,
		lastName: input.lastName,
		email: input.email
	});
	if (details) throw familyRefusalError(details);

	const cleanEmail = input.email.trim().toLowerCase();
	if (await isEmailTaken(ctx, cleanEmail)) throw invalid(CHILD_EMAIL_TAKEN_MESSAGE);

	const consent = consentRefusal(input.consentAcknowledged);
	if (consent) throw familyRefusalError(consent);

	const child = await ctx.childAccount.createChildAccount(ctx, {
		firstName: input.firstName.trim(),
		lastName: input.lastName.trim(),
		email: cleanEmail
	});

	await withTx(ctx, async (txCtx) => {
		await insertMembership(txCtx.db, {
			userId: child.id,
			familyId: input.familyId,
			role: DEFAULT_FAMILY_ROLE,
			memberType: 'child'
		});
		await insertChildConsent(txCtx.db, {
			childUserId: child.id,
			parentUserId: actor.id,
			familyId: input.familyId,
			now: txCtx.clock.now()
		});
	});

	return child;
}

/** The signed, code-bound link both invite doors hand out (#152). */
async function mintedInviteLink(
	ctx: FamilyCtx,
	input: InviteTargetInput,
	inviteCode: string
): Promise<string> {
	const link: FamilyInviteLinkInput = {
		email: input.email,
		firstName: input.firstName,
		lastName: input.lastName,
		familyId: input.familyId,
		inviteCode
	};
	return await ctx.inviteLink.mintInviteLink(link);
}

/**
 * `POST /api/families/{id}/members/email`: creator/admin only, IP rate-limited
 * by the endpoint. Mints one single-use 1-day code, binds it into the signed
 * link, and sends the email through `ctx.mail`. A provider refusal is a value
 * (`delivered: false`), so the caller can answer the legacy 500 body.
 */
export async function sendFamilyInvite(
	ctx: FamilyCtx,
	actor: Actor,
	input: InviteTargetInput
): Promise<{ delivered: boolean }> {
	const gate = managerRefusal(
		'email',
		(await findMembership(ctx.db, actor.id, input.familyId))
			? await findMemberRole(ctx.db, actor.id, input.familyId)
			: null
	);
	if (gate) throw familyRefusalError(gate);

	const target = inviteTargetRefusal(input);
	if (target) throw invalid(target.message, { success: false });

	const code = await mintFamilyInviteCode(ctx, input.familyId, EMAIL_INVITE_PLAN, actor.id);
	const link = await mintedInviteLink(ctx, input, code);
	const inviter = await getPerson(ctx, actor);
	const inviterName = `${inviter.firstName} ${inviter.lastName}`;

	try {
		await ctx.mail.send({
			to: input.email,
			from: ctx.config.mailFrom,
			subject: `You have been invited to join a family by ${inviterName}`,
			html: familyInviteEmailHtml({ inviterName, inviteUrl: link })
		});
		return { delivered: true };
	} catch (error) {
		ctx.log.error('family_invite_email_failed', {
			message: error instanceof Error ? error.message : String(error)
		});
		return { delivered: false };
	}
}

/**
 * `POST /api/families/{id}/members/email/link`: the same gate and fields as the
 * emailed invite, minting the shared 10-use, 1-day code and answering the link.
 */
export async function mintFamilyInviteLink(
	ctx: FamilyCtx,
	actor: Actor,
	input: InviteTargetInput
): Promise<string> {
	const gate = managerRefusal(
		'link',
		(await findMembership(ctx.db, actor.id, input.familyId))
			? await findMemberRole(ctx.db, actor.id, input.familyId)
			: null
	);
	if (gate) throw familyRefusalError(gate);

	const target = inviteTargetRefusal(input);
	if (target) throw invalid(target.message, { success: false });

	const code = await mintFamilyInviteCode(ctx, input.familyId, LINK_INVITE_PLAN, actor.id);
	return await mintedInviteLink(ctx, input, code);
}

/** The body a role/Member Type PATCH with neither field answers. */
const MEMBER_CHANGE_REQUIRED_MESSAGE = 'role or memberType is required';

/**
 * `PATCH /api/families/{id}/members/{userId}`: an optional role change, then an
 * optional Member Type change. The role is applied first and its first refusal
 * stops the request, so the two columns never half-apply in a different order
 * than legacy did.
 */
export async function changeMember(
	ctx: Ctx,
	actor: Actor,
	input: MemberChangeInput
): Promise<void> {
	if (input.role === undefined && input.memberType === undefined) {
		throw invalid(MEMBER_CHANGE_REQUIRED_MESSAGE);
	}

	const actorRole = await findMemberRole(ctx.db, actor.id, input.familyId);

	if (input.role !== undefined) {
		const refusal = roleChangeRefusal({
			actorId: actor.id,
			actorRole,
			userId: input.userId,
			targetRole: await findMemberRole(ctx.db, input.userId, input.familyId),
			role: input.role
		});
		if (refusal) throw familyRefusalError(refusal);
		// SAFETY: `roleChangeRefusal` refuses anything outside FAMILY_ROLES, so the vocabulary already held.
		await updateMemberRole(ctx.db, input.familyId, input.userId, input.role as FamilyRole);
	}

	if (input.memberType !== undefined) {
		const refusal = memberTypeRefusal({
			actorRole,
			userId: input.userId,
			targetRole: await findMemberRole(ctx.db, input.userId, input.familyId),
			memberType: input.memberType
		});
		if (refusal) throw familyRefusalError(refusal);
		// SAFETY: `memberTypeRefusal` refuses anything outside MEMBER_TYPES, so the vocabulary already held.
		await updateMemberType(
			ctx.db,
			input.familyId,
			input.userId,
			input.memberType as MemberType
		);
	}
}

/**
 * `DELETE /api/families/{id}/members/{userId}`: the creator is untouchable
 * (checked before who is asking) and the caller must be an admin. One
 * transaction clears that person's Family Task assignments and drops the roster
 * row; a target who is not a member is a successful no-op (Q-027).
 *
 * The transition bridge for `ports.tasks` is the legacy helper, which removes
 * the roster row itself: it runs first, so the delete below finds nothing and
 * `tasks`' S5 adapter can shrink to the assignment clear.
 */
export async function removeFamilyMember(
	ctx: FamilyCtx,
	actor: Actor,
	input: MemberRemovalInput
): Promise<void> {
	const refusal = removalRefusal({
		actorRole: await findMemberRole(ctx.db, actor.id, input.familyId),
		userId: input.userId,
		targetRole: await findMemberRole(ctx.db, input.userId, input.familyId)
	});
	if (refusal) throw familyRefusalError(refusal);

	await withTx(ctx, async (txCtx) => {
		await txCtx.tasks.unassignMemberTasks(txCtx, input.familyId, input.userId);
		await deleteMembership(txCtx.db, input.familyId, input.userId);
	});
}
