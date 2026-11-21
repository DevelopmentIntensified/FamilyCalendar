/**
 * family families services: the `/family` list, the family detail payload, and
 * creating or renaming a family.
 *
 * Authorization lives here (a detail read is members-only, a rename admin+);
 * the plan limits come from `billing`, the calendar row and the Dashboard
 * Module switches arrive through this module's ports, and the viewer's hidden
 * module list through identity's settings service. Time comes from
 * `ctx.clock`, ids from `ctx.ids`, and every rule from `family.*.rules.ts`, so
 * nothing here re-implements a refusal or reads the process clock.
 *
 * Doc: ./README.md#public-interface
 */
import type { Actor } from '$lib/kernel/ctx/actor';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import { withTx } from '$lib/kernel/db/database.server';
import { forbidden, invalid, notFound } from '$lib/kernel/errors/appError';
import {
	FREE_PLAN_LIMITS,
	familyCreationRefusal,
	memberLimitRefusal
} from '$lib/domains/billing/index';
import { getPlanLimits, getSubscriptionSummary } from '$lib/domains/billing/index.server';
import { getCalendarSettings } from '$lib/domains/identity/index.server';
import type {
	CreateFamilyBody,
	FamilyActiveInvite,
	FamilyCreatePage,
	FamilyDetailView,
	FamilyListPayload,
	FamilyView,
	InviteCodeView,
	UpdateFamilyBody
} from './family.contract';
import {
	FAMILY_NOT_FOUND_MESSAGE,
	UNADDABLE_PICK_MESSAGE,
	buildFamilyCard,
	cleanMemberIds,
	dayOneRosterRefusal,
	familyDraft,
	familyPatch,
	firstNameOf,
	hasUnaddablePick
} from './family.families.rules';
import {
	countOpenFamilyTasks,
	findFamilyById,
	findFirstFamilyIdForUser,
	findMembershipFamilyId,
	insertFamilyWithRoster,
	listMembershipFamilyIds,
	listMemberships,
	listRecentFamilyActivity,
	updateFamilyRow
} from './family.families.repo.server';
import { isInviteUsable } from './family.invites.rules';
import {
	countFamilyMembers,
	listInviteCodes,
	listInviteCodesForFamilies
} from './family.invites.repo.server';
import {
	findFamilyCreatorId,
	findMemberRole,
	listRoster,
	listRosterForFamilies
} from './family.members.repo.server';
import { requireRole } from './family.roles.rules';
import { listVerifiedUserIds } from './family.search.repo.server';
import type { FamilyCtx, FamilyDetailCtx } from './index.server';

/** The zone the card's "Created" label prints in (legacy: the server's UTC). */
const CARD_ZONE = 'UTC';

/** `GET /api/families`: the cards, the side-rail roster, the live codes and the plan usage. */
export type { FamilyListPayload } from './family.contract';

/**
 * The `/family` list: every family the caller belongs to, oldest first, with
 * one grouped open-task count, one roster read and one code read for the whole
 * page (never one query per family, issue 078), plus the family limit the
 * create gate enforces.
 */
export async function listFamilies(ctx: Ctx, actor: Actor): Promise<FamilyListPayload> {
	const memberships = await listMemberships(ctx.db, actor.id);
	const familyIds = memberships.map((membership) => membership.family.id);

	// Sequential, not Promise.all: the ctx db may be one transaction session.
	const openTasks = await countOpenFamilyTasks(ctx.db, familyIds);
	const roster = await listRosterForFamilies(ctx.db, familyIds);
	const codes = await listInviteCodesForFamilies(ctx.db, familyIds);
	const limits = await getPlanLimits(ctx, actor);

	const now = ctx.clock.now();
	const activeInvites: FamilyActiveInvite[] = codes
		.filter((invite) => isInviteUsable(invite, now))
		.map((invite) => ({
			familyId: invite.familyId,
			code: invite.code,
			useCount: invite.useCount,
			maxUses: invite.maxUses,
			expiresAt: invite.expiresAt
		}));

	return {
		families: memberships.map((membership) =>
			buildFamilyCard(membership, openTasks.get(membership.family.id) ?? 0, CARD_ZONE)
		),
		roster,
		activeInvites,
		plan: { used: familyIds.length, limit: limits.familyLimit }
	};
}

/**
 * Which family the actor belongs to, for a module that holds ONE family's rows
 * and whose wire names no family at all (groceries' `scope: 'family'`).
 *
 * The FIRST membership row, with no `ORDER BY`, is the legacy
 * `getUserFamilyId` read that wire has always answered with, so the port does
 * not move a two-family caller to a different list. Q-024's "oldest" rule stays
 * the roster's default (`findMembershipFamilyId`), which is a different
 * question; a single-family caller gets the same answer from both.
 */
export async function familyIdForActor(ctx: Ctx, actor: Actor): Promise<string | null> {
	return await findFirstFamilyIdForUser(ctx.db, actor.id);
}

/**
 * The family a person lands in when nobody names one: the OLDEST family they
 * belong to (owner answer Q-024 B). Null when they have no family.
 *
 * A read keyed by person, not by actor: `calendar` needs it to label a
 * calendar picker and the module cannot read `familyMembers` (R1/R3). It names
 * no family of anyone else's, and the caller already holds the id.
 */
export async function resolveMembershipFamilyId(ctx: Ctx, userId: string): Promise<string | null> {
	return await findMembershipFamilyId(ctx.db, userId);
}

/**
 * EVERY family id a person belongs to, oldest first — the read behind
 * calendar visibility (#098: personal calendars plus every family's). Same
 * keying rule as `resolveMembershipFamilyId` (a person id the caller holds).
 */
export async function listPersonFamilyIds(ctx: Ctx, userId: string): Promise<string[]> {
	return await listMembershipFamilyIds(ctx.db, userId);
}

/**
 * `load` for `/family/create`: the plan gate's answer, the two numbers the
 * banner and the usage line print, and the member limit the picker counts
 * against (issue 076). One read of the limits and one of the memberships.
 */
export async function getFamilyCreatePage(ctx: Ctx, actor: Actor): Promise<FamilyCreatePage> {
	const limits = await getPlanLimits(ctx, actor);
	const used = (await listMemberships(ctx.db, actor.id)).length;
	return {
		familyLimit: limits.familyLimit,
		familyLimitReached: familyCreationRefusal(limits, used) !== null,
		familyUsed: used,
		memberLimit: limits.memberLimit
	};
}

/**
 * The family-size cap (issue 091): the members currently IN the family against
 * the family CREATOR's plan, not the caller's. A family with no creator row
 * falls back to the free plan's limit, as the legacy helper did. Callers turn
 * the message into a 403.
 */
export async function familyMemberLimitRefusal(
	ctx: Ctx,
	actor: Actor,
	familyId: string
): Promise<string | null> {
	const memberCount = await countFamilyMembers(ctx.db, familyId);
	const creatorId = await findFamilyCreatorId(ctx.db, familyId);
	const limits = creatorId
		? await getPlanLimits(ctx, actor, { personId: creatorId })
		: FREE_PLAN_LIMITS;
	return memberLimitRefusal(limits, memberCount);
}

/** The one live code the detail side band shows: the first still usable one. */
function firstUsableInvite(invites: readonly InviteCodeView[], now: Date): InviteCodeView | null {
	return invites.find((invite) => isInviteUsable(invite, now)) ?? null;
}

/**
 * The viewer's role in one family, or null when they hold no membership row.
 *
 * This is the one read behind `getFamily`'s 404 and behind every "may this
 * person manage this family?" question a higher-ranked module asks through this
 * module's entry (dashboardModules and the family switches). Same answer as the
 * legacy `getMemberRole` (`familyData.ts:236-242`): the `familyMembers.role`
 * text, null when there is no row.
 */
export async function getViewerRole(
	ctx: Ctx,
	actorId: string,
	familyId: string
): Promise<string | null> {
	return await findMemberRole(ctx.db, actorId, familyId);
}

/**
 * `GET /api/families/{id}`: the family page's data. Not a member and no such
 * family are ONE 404, so ids cannot be probed (issue 064).
 */
export async function getFamily(
	ctx: FamilyDetailCtx,
	actor: Actor,
	familyId: string
): Promise<FamilyDetailView> {
	const role = await getViewerRole(ctx, actor.id, familyId);
	if (!role) throw notFound(FAMILY_NOT_FOUND_MESSAGE);
	const family = await findFamilyById(ctx.db, familyId);
	if (!family) throw notFound(FAMILY_NOT_FOUND_MESSAGE);

	const members = await listRoster(ctx.db, familyId);
	const activity = await listRecentFamilyActivity(ctx.db, familyId);
	const moduleSwitches = await ctx.moduleSwitches.listFamilyModuleSwitches(ctx, familyId);
	const { settings } = await getCalendarSettings(ctx, actor);
	// The defaults object has no `hiddenDashboardModules` key; a person with no
	// settings row hides nothing.
	const hiddenDashboardModules =
		'hiddenDashboardModules' in settings ? (settings.hiddenDashboardModules ?? []) : [];
	const invites = await listInviteCodes(ctx.db, familyId);
	const activeInvite = firstUsableInvite(invites, ctx.clock.now());
	const summary = await getSubscriptionSummary(ctx, actor);
	const memberships = await listMemberships(ctx.db, actor.id);

	return {
		family,
		members,
		currentUserRole: role || 'member',
		currentUserId: actor.id,
		activity,
		moduleSwitches,
		hiddenDashboardModules,
		activeInvite: activeInvite
			? {
					code: activeInvite.code,
					useCount: activeInvite.useCount ?? 0,
					maxUses: activeInvite.maxUses,
					expiresAt: activeInvite.expiresAt
				}
			: null,
		inviteCreatedBy: firstNameOf(members, activeInvite?.createdBy),
		planUsage: {
			tierName: summary.subscription.tier?.name ?? null,
			aiUsed: summary.aiUsage.used,
			aiLimit: summary.planLimits.aiEventCreationsPerMonth,
			familiesUsed: memberships.length,
			familyLimit: summary.planLimits.familyLimit,
			members: members.length,
			memberLimit: summary.planLimits.memberLimit,
			archivedRetentionDays: summary.planLimits.archivedRetentionDays,
			exportImportEnabled: summary.planLimits.exportImportEnabled
		}
	};
}

/**
 * `POST /api/families`: the plan gate runs first (legacy read the body only
 * once the gate passed), then the name/colour draft, then the verified picks
 * and the day-one member cap. The family and its roster are written in one
 * transaction.
 *
 * The family calendar row is written inside the same transaction, through
 * `ports.calendar`: calendar's adapter inserts it through whatever ctx it is
 * handed, so the family and its calendar commit or roll back together.
 */
export async function createFamily(
	ctx: FamilyCtx,
	actor: Actor,
	body: CreateFamilyBody
): Promise<FamilyView> {
	const limits = await getPlanLimits(ctx, actor);
	const planRefusal = familyCreationRefusal(limits, (await listMemberships(ctx.db, actor.id)).length);
	if (planRefusal) throw forbidden(planRefusal, { upgradeRequired: true });

	const draft = familyDraft(body.name, body.color);
	if (!draft.ok) {
		const { refusal } = draft;
		throw invalid(refusal.message);
	}

	const picked = cleanMemberIds(body.memberIds ?? [], actor.id);
	if (picked.length > 0) {
		const verifiedIds = await listVerifiedUserIds(ctx.db, picked);
		if (hasUnaddablePick(picked, verifiedIds)) throw invalid(UNADDABLE_PICK_MESSAGE);
		const rosterRefusal = dayOneRosterRefusal(
			limits.memberLimit,
			picked.length
		);
		if (rosterRefusal) throw forbidden(rosterRefusal.message);
	}

	const familyId = ctx.ids.id();
	return await withTx(ctx, async (txCtx) => {
		const family = await insertFamilyWithRoster(txCtx.db, {
			id: familyId,
			name: draft.draft.name,
			color: draft.draft.color,
			creatorId: actor.id,
			memberIds: picked,
			now: txCtx.clock.now()
		});
		// calendar's adapter writes through the ctx it is handed, so passing the
		// transaction ctx commits the family and its calendar together.
		await ctx.calendar.createFamilyCalendar(txCtx, familyId);
		return family;
	});
}

/**
 * `PATCH /api/families/{id}`: rename and/or recolour (admin+). Absent fields
 * are unchanged, an empty patch writes nothing, and the answer is the family
 * row as it now stands.
 */
export async function updateFamily(
	ctx: Ctx,
	actor: Actor,
	familyId: string,
	body: UpdateFamilyBody
): Promise<FamilyView> {
	const roleRefusal = requireRole(await findMemberRole(ctx.db, actor.id, familyId), 'admin');
	if (roleRefusal) throw forbidden(roleRefusal.message);

	// The HTTP contract already trims; a direct service caller (or the legacy
	// shape's untrimmed body) is trimmed here too so the wire copy matches.
	const patch = familyPatch((body.name ?? '').trim(), body.color ?? '');
	if (patch) await updateFamilyRow(ctx.db, familyId, patch);
	const family = await findFamilyById(ctx.db, familyId);
	// The role check above proves a membership row; a family that vanished
	// underneath it is the same answer a stranger gets.
	if (!family) throw notFound(FAMILY_NOT_FOUND_MESSAGE);
	return family;
}
