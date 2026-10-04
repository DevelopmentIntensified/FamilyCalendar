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
	getAiUsageThisMonth,
	getSubscriptionStatus,
	getUserSubscriptionLimits
} from '$lib/server/services/subscriptionService';
import { db } from '$lib/server/db';
import { families, familyMembers } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import type { PageServerLoad, Actions } from './$types';
import { error, fail, isHttpError, isRedirect } from '@sveltejs/kit';

/**
 * Unreachable-by-id: wrong family, or a viewer who is not a member of it.
 * Declared as a function so the throw site reads as a statement — `error()`
 * returns an HttpError to be thrown, and a bare `if (x) error(...)` body
 * silently no-ops in a way that reads like a guard.
 */
function notFound(): never {
	throw error(404, 'Family not found');
}

/**
 * The one code somebody could still join with (issue 124).
 *
 * The approved family page shows an "Active invitation" summary, so the band
 * has to mean what it says: an expired code or a code that has used up its
 * `maxUses` is not an invitation any more. Where there is none, the band says
 * so — a dead code presented as live is worse than no band.
 */
function pickActiveInvite(invites: Awaited<ReturnType<typeof getFamilyInviteCodes>>) {
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

export const load: PageServerLoad = async ({ params, locals }) => {
	try {
		const [currentMember] = await db
			.select({ role: familyMembers.role })
			.from(familyMembers)
			.where(
				and(eq(familyMembers.familyId, params.familyId), eq(familyMembers.userId, locals.user.id))
			)
			.limit(1);

		// A non-member gets a 404, not a rendered page whose five family links
		// point at /family/undefined/... — the page has no empty state to catch
		// it, so the refusal has to happen here (issue 064).
		if (!currentMember) {
			notFound();
		}

		const familyResult = await db.select().from(families).where(eq(families.id, params.familyId));
		const family = familyResult[0] || null;

		if (!family) {
			notFound();
		}

		const members = await getFamilyRoster(params.familyId);
		const activity = await getRecentFamilyActivity(params.familyId);
		const moduleSwitches = await getFamilyModuleSwitches(params.familyId);
		// The viewer's own hidden list, so a Dashboard Module row can tell
		// "off for everyone" from "on, but you hid it for yourself" (#077).
		const settings = await getUserSettings(locals.user.id);

		// The approved side bands (issue 124): the live invitation and the plan
		// the family is living on. Read once, in parallel — a band is not worth
		// a waterfall.
		const [invites, limits, subscription, aiUsage, memberships] = await Promise.all([
			getFamilyInviteCodes(params.familyId),
			getUserSubscriptionLimits(locals.user.id),
			getSubscriptionStatus(locals.user.id),
			getAiUsageThisMonth(locals.user.id),
			// "Families" is the families this user belongs to, which is what the
			// create gate counts too (canCreateFamily) — the same function, so
			// the band and the gate cannot disagree.
			getUserFamilyMemberships(locals.user.id)
		]);
		const activeInvite = pickActiveInvite(invites);

		return {
			family,
			members,
			currentUserRole: currentMember.role || 'member',
			currentUserId: locals.user.id,
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
				// `getAiUsageThisMonth` answers { used, limit, remaining }; the band
				// wants the COUNT and the plan's ceiling, so the object is unpacked
				// here rather than printed into the markup.
				aiUsed: aiUsage.used,
				aiLimit: limits.aiEventCreationsPerMonth ?? aiUsage.limit ?? 0,
				// "Families" is the families this user belongs to, which is what
				// the create gate counts too (canCreateFamily).
				familiesUsed: memberships.length,
				familyLimit: limits.familyLimit ?? 0,
				members: members.length,
				memberLimit: limits.memberLimit ?? 0,
				archivedRetentionDays: limits.archivedRetentionDays ?? 0,
				exportImportEnabled: limits.exportImportEnabled ?? false
			}
		};
	} catch (err) {
		// SvelteKit redirects/404s thrown above land here; re-throw them
		// rather than turning a 404 into a page that renders broken links.
		if (isRedirect(err) || isHttpError(err)) throw err;
		console.error('[load] Error:', err);
		throw error(500, 'Could not load this family');
	}
};

const PRIVILEGE = { creator: 2, admin: 1, member: 0 } as const;

async function getMemberRole(familyId: string, userId: string) {
	const [member] = await db
		.select({ role: familyMembers.role })
		.from(familyMembers)
		.where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.userId, userId)))
		.limit(1);
	return member?.role || null;
}

function isString(value: FormDataEntryValue | null): value is string {
	return typeof value === 'string';
}

function formString(formData: FormData, key: string): string {
	const value = formData.get(key);
	return isString(value) ? value : '';
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

async function requireMinRole(familyId: string, userId: string, minRole: 'creator' | 'admin') {
	const role = await getMemberRole(familyId, userId);
	if (!role || roleRank(role) < PRIVILEGE[minRole]) {
		return fail(403, { error: 'You do not have permission to perform this action' });
	}
}

export const actions: Actions = {
	removeMember: async ({ request, params, locals }) => {
		const formData = await request.formData();
		const userId = formString(formData, 'userId');
		const familyId = params.familyId;

		if (!userId) {
			return fail(400, { error: 'User ID is required' });
		}

		const targetRole = await getMemberRole(familyId, userId);
		if (targetRole === 'creator') {
			return fail(403, { error: 'Cannot remove the family creator' });
		}

		const roleCheck = await requireMinRole(familyId, locals.user.id, 'admin');
		if (roleCheck) return roleCheck;

		await removeFamilyMember(familyId, userId);
		return { success: true };
	},
	updateRole: async ({ request, params, locals }) => {
		const formData = await request.formData();
		const userId = formString(formData, 'userId');
		const role = formString(formData, 'role');
		const familyId = params.familyId;

		if (!userId || !role) {
			return fail(400, { error: 'User ID and role are required' });
		}

		if (!['creator', 'admin', 'member'].includes(role)) {
			return fail(400, { error: 'Role must be creator, admin, or member' });
		}

		const currentUserRole = await getMemberRole(familyId, locals.user.id);
		if (!currentUserRole) return fail(403, { error: 'You do not have permission' });

		const isSelf = userId === locals.user.id;
		if (isSelf) return fail(400, { error: 'Cannot change your own role' });

		const targetRole = await getMemberRole(familyId, userId);
		if (!targetRole) return fail(400, { error: 'Member not found' });

		// Mirrors removeMember: the creator's role is untouchable — only the
		// creator themself could change it, and self-changes are already blocked.
		if (targetRole === 'creator') {
			return fail(403, { error: "Cannot change the family creator's role" });
		}

		if (role === 'creator') {
			if (currentUserRole !== 'creator')
				return fail(403, { error: 'Only the creator can promote to creator' });
		} else {
			if (currentUserRole === 'member') return fail(403, { error: 'You do not have permission' });
		}

		await db
			.update(familyMembers)
			.set({ role })
			.where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.userId, userId)));
		return { success: true };
	},
	// Member Type is a profile label ('parent'|'child'|'member'), not a
	// permission — and this action is admin-only (decision 7). Unlike role,
	// members cannot change their own label either.
	setMemberType: async ({ request, params, locals }) => {
		const formData = await request.formData();
		const userId = formString(formData, 'userId');
		const memberType = formString(formData, 'memberType');
		const familyId = params.familyId;

		if (!userId || !memberType) {
			return fail(400, { error: 'User ID and member type are required' });
		}

		if (!['parent', 'child', 'member'].includes(memberType)) {
			return fail(400, { error: 'Member type must be parent, child, or member' });
		}

		const roleCheck = await requireMinRole(familyId, locals.user.id, 'admin');
		if (roleCheck) return roleCheck;

		const target = await getMemberRole(familyId, userId);
		if (!target) return fail(400, { error: 'Member not found' });

		await db
			.update(familyMembers)
			.set({ memberType })
			.where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.userId, userId)));
		return { success: true };
	},
	updateFamily: async ({ request, params, locals }) => {
		const formData = await request.formData();
		const name = formString(formData, 'name');
		const color = formString(formData, 'color');

		const roleCheck = await requireMinRole(params.familyId, locals.user.id, 'admin');
		if (roleCheck) return roleCheck;

		const updateData = name && color ? { name, color } : name ? { name } : color ? { color } : null;

		if (updateData) {
			await updateFamilies(params.familyId, updateData);
		}
		return { success: true };
	},
	toggleDashboardModule: async ({ request, params, locals }) => {
		const formData = await request.formData();
		const module = formString(formData, 'module');
		const enabled = formData.get('enabled') === 'true';

		const roleCheck = await requireMinRole(params.familyId, locals.user.id, 'admin');
		if (roleCheck) return roleCheck;

		if (!module) {
			return fail(400, { error: 'Module is required' });
		}

		try {
			await setFamilyModuleSwitch(params.familyId, module, enabled);
			return { success: true };
		} catch (error) {
			return fail(400, {
				error: error instanceof Error ? error.message : 'Failed to update module'
			});
		}
	}
};
