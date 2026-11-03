/**
 * Family pages' data + mutations (#292 L0: G10a, G10b, G10c, G11). The
 * /family loaders and form actions were the only home of this logic; it
 * lives here so the pages and the `/api/families/**` JSON endpoints share
 * ONE implementation — same queries, same role checks, same messages.
 *
 * Mutations return a result union; the page maps it onto `fail(status,
 * { error })`, the API onto `json({ error }, { status })`.
 */
import {
	getFamilyRoster,
	getFamilyInviteCodes,
	getUserFamilyMemberships,
	removeFamilyMember,
	updateFamilies
} from '$lib/server/db/actions/families';
import {
	getFamilyModuleSwitches,
	setFamilyModuleSwitch
} from '$lib/server/db/actions/dashboardModules';
import { getRecentFamilyActivity } from '$lib/server/db/actions/familyActivity';
import { getUserSettings } from '$lib/server/db/actions/userSettings';
import {
	canCreateFamily,
	getAiUsageThisMonth,
	getSubscriptionStatus,
	getUserSubscriptionLimits
} from '$lib/server/services/subscriptionService';
import { db } from '$lib/server/db';
import {
	calendars,
	families,
	familyInviteCodes,
	familyMembers,
	tasks,
	users
} from '$lib/server/db/schema';
import { generateId } from '$lib/server/utils/generateId';
import { DEFAULT_FAMILY_COLOR, isFamilyColor } from '$lib/utils/familyPalette';
import { and, count, eq, inArray, isNull } from 'drizzle-orm';
import { getPublicTasksForFamily, getTasksForFamily } from '$lib/server/db/actions/tasks';
import { listCategoryOptions } from '$lib/server/db/actions/taskCategories';
import { getUserZone } from '$lib/server/utils/userTimezone';

export type FamilyResult = { ok: true } | { ok: false; status: number; error: string };
const refuse = (status: number, error: string) => ({ ok: false as const, status, error });

// Minting an invite code is creator/admin-only — the same gate
// `/api/family/invite` and `members/add/direct` use. The membership ROLE is
// the permission; memberType (the personal profile) is not (ADR-0001).
export const INVITE_MANAGER_ROLES = new Set(['creator', 'admin']);

/** G10a: the /family list — every family the user is a member of. */
export async function loadFamiliesOverview(userId: string) {
	const memberships = await getUserFamilyMemberships(userId);
	const familyIds = memberships.map((m) => m.family.id);

	// The card's stat: open Family Tasks per family — ONE grouped query for the
	// whole page, never one query per card (issue 078). "Open" is the Family
	// Task Board's own definition: not completed, not archived.
	const openTaskRows = familyIds.length
		? await db
				.select({ familyId: tasks.familyId, openTasks: count() })
				.from(tasks)
				.where(
					and(
						inArray(tasks.familyId, familyIds),
						isNull(tasks.completedAt),
						isNull(tasks.archivedAt)
					)
				)
				.groupBy(tasks.familyId)
		: [];
	const openTasksByFamily = new Map(openTaskRows.map((row) => [row.familyId, row.openTasks]));

	// `family.html`'s side rail: a row per person — name, Member Type, role.
	// ONE roster read for the whole page across every family.
	const roster = familyIds.length
		? await db
				.select({
					familyId: familyMembers.familyId,
					userId: users.id,
					firstName: users.firstName,
					lastName: users.lastName,
					role: familyMembers.role,
					memberType: familyMembers.memberType
				})
				.from(users)
				.innerJoin(familyMembers, eq(users.id, familyMembers.userId))
				.where(inArray(familyMembers.familyId, familyIds))
				.orderBy(users.firstName)
		: [];

	// One code read for every family, filtered to the codes that can still be
	// used: an expired or used-up code is not an invitation.
	const codeRows = familyIds.length
		? await db
				.select({
					familyId: familyInviteCodes.familyId,
					code: familyInviteCodes.code,
					useCount: familyInviteCodes.useCount,
					maxUses: familyInviteCodes.maxUses,
					expiresAt: familyInviteCodes.expiresAt
				})
				.from(familyInviteCodes)
				.where(inArray(familyInviteCodes.familyId, familyIds))
		: [];
	const now = Date.now();
	const activeInvites = codeRows.filter(
		(row) =>
			new Date(row.expiresAt).getTime() > now &&
			(row.maxUses === null || (row.useCount ?? 0) < row.maxUses)
	);

	// Plan usage for the pill — the same familyLimit the create gate enforces.
	const { familyLimit } = await getUserSubscriptionLimits(userId);

	return {
		families: memberships.map((m) => ({
			...m.family,
			memberCount: m.memberCount,
			openTasks: openTasksByFamily.get(m.family.id) ?? 0,
			// The approved card's roster strip — first names (issue 124). The
			// userId rides along so each avatar can carry that person's colour.
			members: (m.firstNames ?? []).map((firstName, i) => ({
				firstName,
				userId:
					roster.find((r) => r.familyId === m.family.id && r.firstName === firstName)?.userId ??
					`roster-${i}`
			})),
			createdLabel: m.family.createdAt.toLocaleDateString(),
			// Whether this page offers "Invite by link" for the family (issue 091).
			canInvite: m.role !== null && INVITE_MANAGER_ROLES.has(m.role),
			// The viewer's own membership role (#292 G10a; additive).
			role: m.role
		})),
		roster,
		activeInvites,
		plan: { used: familyIds.length, limit: familyLimit }
	};
}

/**
 * The one code somebody could still join with (issue 124): an expired code
 * or a code that has used up its `maxUses` is not an invitation any more.
 */
export function pickActiveInvite(invites: Awaited<ReturnType<typeof getFamilyInviteCodes>>) {
	const now = Date.now();
	return (
		invites.find((invite) => {
			const expired = new Date(invite.expiresAt).getTime() <= now;
			const usedUp = invite.maxUses !== null && (invite.useCount ?? 0) >= invite.maxUses;
			return !expired && !usedUp;
		}) ?? null
	);
}

/** First name only — the band says "Created by Maya", like the prototype. */
function firstNameOf(
	members: Awaited<ReturnType<typeof getFamilyRoster>>,
	userId: string | null | undefined
): string | null {
	if (!userId) return null;
	const member = members.find((m) => m.userId === userId);
	return member?.firstName || null;
}

/**
 * G10b: the family detail page. `null` = unreachable by id: wrong family,
 * or a viewer who is not a member of it (one answer for both — issue 064).
 */
export async function loadFamilyDetail(userId: string, familyId: string) {
	const [currentMember] = await db
		.select({ role: familyMembers.role })
		.from(familyMembers)
		.where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.userId, userId)))
		.limit(1);
	if (!currentMember) return null;

	const familyResult = await db.select().from(families).where(eq(families.id, familyId));
	const family = familyResult[0] || null;
	if (!family) return null;

	const members = await getFamilyRoster(familyId);
	const activity = await getRecentFamilyActivity(familyId);
	const moduleSwitches = await getFamilyModuleSwitches(familyId);
	// The viewer's own hidden list, so a Dashboard Module row can tell
	// "off for everyone" from "on, but you hid it for yourself" (#077).
	const settings = await getUserSettings(userId);

	// The approved side bands (issue 124): the live invitation and the plan.
	const [invites, limits, subscription, aiUsage, memberships] = await Promise.all([
		getFamilyInviteCodes(familyId),
		getUserSubscriptionLimits(userId),
		getSubscriptionStatus(userId),
		getAiUsageThisMonth(userId),
		// "Families" is the families this user belongs to, which is what the
		// create gate counts too (canCreateFamily).
		getUserFamilyMemberships(userId)
	]);
	const activeInvite = pickActiveInvite(invites);

	return {
		family,
		members,
		currentUserRole: currentMember.role || 'member',
		currentUserId: userId,
		activity,
		moduleSwitches,
		hiddenDashboardModules: settings?.hiddenDashboardModules ?? [],
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
			tierName: subscription.tier?.name || null,
			aiUsed: aiUsage.used,
			aiLimit: limits.aiEventCreationsPerMonth ?? aiUsage.limit ?? 0,
			familiesUsed: memberships.length,
			familyLimit: limits.familyLimit ?? 0,
			members: members.length,
			memberLimit: limits.memberLimit ?? 0,
			archivedRetentionDays: limits.archivedRetentionDays ?? 0,
			exportImportEnabled: limits.exportImportEnabled ?? false
		}
	};
}

const PRIVILEGE = { creator: 2, admin: 1, member: 0 } as const;

export async function getMemberRole(familyId: string, userId: string) {
	const [member] = await db
		.select({ role: familyMembers.role })
		.from(familyMembers)
		.where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.userId, userId)))
		.limit(1);
	return member?.role || null;
}

function roleRank(role: string): number {
	switch (role) {
		case 'creator':
			return 2;
		case 'admin':
			return 1;
		case 'member':
			return 0;
		default:
			return -1;
	}
}

async function requireMinRole(
	familyId: string,
	userId: string,
	minRole: 'creator' | 'admin'
): Promise<FamilyResult | null> {
	const role = await getMemberRole(familyId, userId);
	if (!role || roleRank(role) < PRIVILEGE[minRole]) {
		return refuse(403, 'You do not have permission to perform this action');
	}
	return null;
}

export async function removeMember(
	actorId: string,
	familyId: string,
	userId: string
): Promise<FamilyResult> {
	if (!userId) return refuse(400, 'User ID is required');
	const targetRole = await getMemberRole(familyId, userId);
	if (targetRole === 'creator') return refuse(403, 'Cannot remove the family creator');
	const roleCheck = await requireMinRole(familyId, actorId, 'admin');
	if (roleCheck) return roleCheck;
	await removeFamilyMember(familyId, userId);
	return { ok: true };
}

export async function updateMemberRole(
	actorId: string,
	familyId: string,
	userId: string,
	role: string
): Promise<FamilyResult> {
	if (!userId || !role) return refuse(400, 'User ID and role are required');
	if (!['creator', 'admin', 'member'].includes(role)) {
		return refuse(400, 'Role must be creator, admin, or member');
	}
	const currentUserRole = await getMemberRole(familyId, actorId);
	if (!currentUserRole) return refuse(403, 'You do not have permission');
	if (userId === actorId) return refuse(400, 'Cannot change your own role');
	const targetRole = await getMemberRole(familyId, userId);
	if (!targetRole) return refuse(400, 'Member not found');
	// Mirrors removeMember: the creator's role is untouchable.
	if (targetRole === 'creator') return refuse(403, "Cannot change the family creator's role");
	if (role === 'creator') {
		if (currentUserRole !== 'creator') return refuse(403, 'Only the creator can promote to creator');
	} else if (currentUserRole === 'member') {
		return refuse(403, 'You do not have permission');
	}
	await db
		.update(familyMembers)
		.set({ role })
		.where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.userId, userId)));
	return { ok: true };
}

/**
 * Member Type is a profile label ('parent'|'child'|'member'), not a
 * permission — and setting it is admin-only (decision 7).
 */
export async function setMemberType(
	actorId: string,
	familyId: string,
	userId: string,
	memberType: string
): Promise<FamilyResult> {
	if (!userId || !memberType) return refuse(400, 'User ID and member type are required');
	if (!['parent', 'child', 'member'].includes(memberType)) {
		return refuse(400, 'Member type must be parent, child, or member');
	}
	const roleCheck = await requireMinRole(familyId, actorId, 'admin');
	if (roleCheck) return roleCheck;
	const target = await getMemberRole(familyId, userId);
	if (!target) return refuse(400, 'Member not found');
	await db
		.update(familyMembers)
		.set({ memberType })
		.where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.userId, userId)));
	return { ok: true };
}

/** Rename / recolour (admin+). Empty name/colour = unchanged. */
export async function updateFamilyDetails(
	actorId: string,
	familyId: string,
	name: string,
	color: string
): Promise<FamilyResult> {
	const roleCheck = await requireMinRole(familyId, actorId, 'admin');
	if (roleCheck) return roleCheck;
	const updateData = name && color ? { name, color } : name ? { name } : color ? { color } : null;
	if (updateData) await updateFamilies(familyId, updateData);
	return { ok: true };
}

/** A family Dashboard Module master switch (admin+). */
export async function toggleDashboardModule(
	actorId: string,
	familyId: string,
	module: string,
	enabled: boolean
): Promise<FamilyResult> {
	const roleCheck = await requireMinRole(familyId, actorId, 'admin');
	if (roleCheck) return roleCheck;
	if (!module) return refuse(400, 'Module is required');
	try {
		await setFamilyModuleSwitch(familyId, module, enabled);
		return { ok: true };
	} catch (error) {
		return refuse(400, error instanceof Error ? error.message : 'Failed to update module');
	}
}

/**
 * G10c: the /family/invitations page. `requested` addresses one family;
 * without a match the OLDEST family is chosen (issue 098) — callers that
 * need exactly `requested` compare `family.id`. Codes are listed only to a
 * creator/admin of the chosen family.
 */
export async function loadInvitations(userId: string, requested: string | null) {
	const memberships = await getUserFamilyMemberships(userId);
	const chosen = memberships.find((m) => m.family.id === requested) ?? memberships[0] ?? null;
	if (!chosen) {
		return { invitations: [], canManageInvites: false, family: null, memberships: [] };
	}
	// The membership's own role is the permission; memberType is not.
	const canManageInvites = chosen.role !== null && INVITE_MANAGER_ROLES.has(chosen.role);
	const invites = canManageInvites
		? await db
				.select()
				.from(familyInviteCodes)
				.where(eq(familyInviteCodes.familyId, chosen.family.id))
		: [];
	return {
		invitations: invites,
		canManageInvites,
		family: chosen.family,
		memberships: memberships.map((m) => ({
			id: m.family.id,
			name: m.family.name,
			canManageInvites: m.role !== null && INVITE_MANAGER_ROLES.has(m.role)
		}))
	};
}

/**
 * G11: the /family/tasks board. `requested` addresses one family; without a
 * match the OLDEST family is chosen. `null` = the user has no family.
 */
export async function loadFamilyTasks(userId: string, requested: string | null) {
	const memberships = await getUserFamilyMemberships(userId);
	const chosen = memberships.find((m) => m.family.id === requested) ?? memberships[0] ?? null;
	if (!chosen) return null;
	const familyId = chosen.family.id;
	const zone = await getUserZone(userId);
	const [tasksList, publicTasks, familyRoster, taskCategories] = await Promise.all([
		// Cursor pin (110) lives inside each list read (family scope, plus the
		// member-personal leg for the public tab).
		getTasksForFamily(familyId, zone),
		getPublicTasksForFamily(familyId, zone),
		getFamilyRoster(familyId),
		// #280: the viewer's own category list (editor suggestions); never throws.
		listCategoryOptions(userId)
	]);
	return { tasks: tasksList, publicTasks, familyRoster, familyId, userId, taskCategories };
}

export type CreateFamilyInput = { name: string; color: string; memberIds: unknown[] };
export type CreateFamilyResult =
	| { ok: true; familyId: string }
	| { ok: false; status: number; error: string; upgradeRequired?: boolean };

/** The picked member ids, cleaned: no blanks, no repeats, and never the creator. */
export function cleanMemberIds(values: unknown[], creatorId: string): string[] {
	const seen = new Set<string>();
	for (const value of values) {
		if (typeof value !== 'string') continue;
		const id = value.trim();
		if (!id || id === creatorId) continue;
		seen.add(id);
	}
	return [...seen];
}

/**
 * G10d: create a family (+ its calendar + the picked members) — the
 * /family/create action. The plan gate runs BEFORE `readInput` (the page
 * reads its form only once the gate passes).
 */
export async function createFamilyWithMembers(
	userId: string,
	readInput: () => Promise<CreateFamilyInput>
): Promise<CreateFamilyResult> {
	const familyCheck = await canCreateFamily(userId);
	if (!familyCheck.allowed) {
		return { ok: false, status: 403, error: familyCheck.reason ?? '', upgradeRequired: true };
	}
	const { name, color, memberIds } = await readInput();

	if (!name || name.trim().length === 0) return refuse(400, 'Family name is required');
	if (name.trim().length > 50) return refuse(400, 'Family name must be 50 characters or less');
	// The colour is free text in the column, so the guard is here (#099).
	if (color && !isFamilyColor(color)) return refuse(400, 'Pick one of the offered family colours');
	const familyColor = color || DEFAULT_FAMILY_COLOR;
	const familyId = generateId(15);
	// "Who is in it" (issue 076): the family does not exist yet, so this is
	// the only place their membership can be written.
	const picked = cleanMemberIds(memberIds, userId);

	if (picked.length > 0) {
		// A crafted post can name any id, so every pick is checked against a
		// real, verified account.
		const found = await db
			.select({ id: users.id, emailVerified: users.emailVerified })
			.from(users)
			.where(inArray(users.id, picked));
		const addable = new Set(found.filter((u) => u.emailVerified).map((u) => u.id));
		if (picked.some((id) => !addable.has(id))) {
			return refuse(
				400,
				'One of the people you picked cannot be added yet — send them an email invite instead.'
			);
		}
		// The member limit is enforced here, not only in the picker. The
		// creator counts as one member.
		const { memberLimit } = await getUserSubscriptionLimits(userId);
		if (1 + picked.length > memberLimit) {
			return refuse(
				403,
				`Your plan allows ${memberLimit} member${memberLimit === 1 ? '' : 's'} in a family. Create the family first, then add the rest from the family page.`
			);
		}
	}

	try {
		// One transaction: a failure half-way must not leave a family with no
		// calendar and no members (issue 076).
		await db.transaction(async (tx) => {
			await tx.insert(families).values({ id: familyId, name: name.trim(), color: familyColor });
			await tx.insert(familyMembers).values([
				{ userId, familyId, role: 'creator', memberType: 'member' },
				// role is the permission, memberType the personal profile (ADR-0001).
				...picked.map((id) => ({ userId: id, familyId, role: 'member', memberType: 'member' }))
			]);
			await tx.insert(calendars).values({ familyId });
		});
	} catch (error) {
		console.error('Error creating family:', error);
		return refuse(500, 'Failed to create family');
	}
	return { ok: true, familyId };
}
