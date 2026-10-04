import { db } from '$lib/server/db';
import {
	calendars,
	families,
	familyMembers,
	familyInviteCodes,
	tasks,
	users,
	type Family,
	type FamilyInviteCode
} from '$lib/server/db/schema';
import { count, eq, and, gt, ilike, notInArray, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { generateId } from 'lucia';
import { canAddFamilyMember } from '$lib/server/services/subscriptionService';

export async function getFamiliesCount() {
	return await db.select({ count: count() }).from(families);
}

export async function getFamilies() {
	return await db.select().from(families).orderBy(families.createdAt);
}

export async function getFamily(id: string) {
	const [familiesItem] = await db.select().from(families).where(eq(families.id, id));
	return familiesItem;
}

/**
 * One of a user's Family Memberships: the Family itself, the membership's own
 * labels, and that family's roster size.
 *
 * `role` is the membership role — the PERMISSION (`creator` | `admin` |
 * `member`). `memberType` is the Member Type — the personal-profile label
 * (`parent` | `child` | `member`), which is NOT a permission.
 */
export interface UserFamilyMembership {
	family: Family;
	role: string | null;
	memberType: string | null;
	/** Roster size of this Family, counted by the same query. */
	memberCount: number;
	/**
	 * Every member's first name for this Family, first-name order, aggregated by
	 * the SAME query that counts the roster (issue 124). The approved family card
	 * shows WHO is in the family, not how many — and a second read per family is
	 * exactly the shape issues 078 and 098 removed.
	 */
	firstNames: string[];
}

/**
 * EVERY Family the user holds a Family Membership in, oldest first, each with
 * the membership's role/Member Type and that family's roster size.
 *
 * The canonical multi-family read (issue 098). This used to return only the
 * member's FIRST `familyMembers` row with no ORDER BY, so "which row is
 * first" was whatever the database handed back — and callers that compared it
 * against a family id in the URL were silently refusing half a user's
 * families. Callers that need one specific family now ask for it BY ID
 * (`getFamilyMemberRole`); there is no "the user's one family" to guess at.
 */
export async function getUserFamilyMemberships(
	userId: string
): Promise<UserFamilyMembership[]> {
	// `roster` is the family's WHOLE membership set, joined back onto the
	// user's own row so the roster size rides along with the read instead of
	// costing a second query per family.
	const roster = alias(familyMembers, 'roster');
	// …and `rosterUser` carries that same roster's first names home with it, for
	// the approved card's roster strip (issue 124). Aggregated here, not in a
	// second query per family: this read stays ONE query however many families
	// the user is in (issue 078).
	const rosterUser = alias(users, 'roster_user');

	const rows = await db
		.select({
			id: families.id,
			name: families.name,
			color: families.color,
			createdAt: families.createdAt,
			role: familyMembers.role,
			memberType: familyMembers.memberType,
			memberCount: count(roster.userId),
			firstNames: sql<string[]>`coalesce(array_agg(${rosterUser.firstName} order by ${rosterUser.firstName}) filter (where ${rosterUser.firstName} is not null), '{}')`
		})
		.from(familyMembers)
		.innerJoin(families, eq(familyMembers.familyId, families.id))
		.leftJoin(roster, eq(roster.familyId, familyMembers.familyId))
		.leftJoin(rosterUser, eq(roster.userId, rosterUser.id))
		.where(eq(familyMembers.userId, userId))
		// families.id is the primary key, so Postgres resolves the rest of the
		// selected family columns from it — no need to list them all here.
		.groupBy(families.id, familyMembers.role, familyMembers.memberType)
		.orderBy(families.createdAt);

	return rows.map((row) => ({
		family: {
			id: row.id,
			name: row.name,
			color: row.color,
			createdAt: row.createdAt
		},
		role: row.role,
		memberType: row.memberType,
		memberCount: row.memberCount,
		firstNames: row.firstNames ?? []
	}));
}

export async function createFamily(data: Omit<Family, 'id' | 'createdAt'>) {
	const [createdFamilies] = await db.insert(families).values(data).returning();
	await db.insert(calendars).values({
		familyId: createdFamilies.id
	});
	return createdFamilies;
}

export async function updateFamilies(id: string, data: Partial<Omit<Family, 'id' | 'createdAt'>>) {
	const [updatedFamilies] = await db
		.update(families)
		.set(data)
		.where(eq(families.id, id))
		.returning();
	return updatedFamilies;
}

export async function deleteFamilies(id: string) {
	await db.delete(families).where(eq(families.id, id));
}

/**
 * How many people one join code admits when nobody says otherwise.
 *
 * Minting used to answer this question twice with two numbers: this action
 * defaulted to a single use, and `/api/family/invite` clamped to ten. The same
 * link then meant two different things depending on which door it came out of,
 * so the default is declared once here and the route's clamp matches it
 * (issue 091).
 */
export const DEFAULT_INVITE_MAX_USES = 10;

export async function generateInviteCode(
	familyId: string,
	options?: { expiresInDays?: number; maxUses?: number; createdBy?: string }
): Promise<FamilyInviteCode> {
	const code = generateId(10);
	const expiresInDays = options?.expiresInDays ?? 7;
	const expiresAt = new Date();
	expiresAt.setDate(expiresAt.getDate() + expiresInDays);

	const [inviteCode] = await db
		.insert(familyInviteCodes)
		.values({
			code,
			familyId,
			expiresAt,
			maxUses: options?.maxUses ?? DEFAULT_INVITE_MAX_USES,
			useCount: 0,
			createdBy: options?.createdBy
		})
		.returning();

	return inviteCode;
}

export async function verifyInviteCode(
	code: string
): Promise<{ family: Family; inviteCode: FamilyInviteCode } | null> {
	const [inviteCode] = await db
		.select()
		.from(familyInviteCodes)
		.where(and(eq(familyInviteCodes.code, code), gt(familyInviteCodes.expiresAt, new Date())));

	if (!inviteCode) return null;

	const [family] = await db.select().from(families).where(eq(families.id, inviteCode.familyId));
	if (!family) return null;

	if (
		inviteCode.maxUses !== null &&
		inviteCode.useCount !== null &&
		inviteCode.useCount >= inviteCode.maxUses
	) {
		return null;
	}

	return { family, inviteCode };
}

export async function acceptInvite(
	userId: string,
	code: string
): Promise<{ accepted: boolean; reason?: 'family-full' }> {
	const verification = await verifyInviteCode(code);
	if (!verification) return { accepted: false };

	const [existing] = await db
		.select()
		.from(familyMembers)
		.where(
			and(eq(familyMembers.userId, userId), eq(familyMembers.familyId, verification.family.id))
		);

	if (existing) return { accepted: false };

	// Enforce the subscription member limit on the join path too — an invite
	// code must not become a way to bypass the family-size cap.
	const limitCheck = await canAddFamilyMember(verification.family.id);
	if (!limitCheck.allowed) return { accepted: false, reason: 'family-full' };

	await db.insert(familyMembers).values({
		userId,
		familyId: verification.family.id
	});

	await db
		.update(familyInviteCodes)
		.set({ useCount: (verification.inviteCode.useCount ?? 0) + 1 })
		.where(eq(familyInviteCodes.code, code));

	return { accepted: true };
}

/** The user's family id, or null. Single-membership assumption. */
export async function getUserFamilyId(userId: string): Promise<string | null> {
	const [member] = await db
		.select({ familyId: familyMembers.familyId })
		.from(familyMembers)
		.where(eq(familyMembers.userId, userId));
	return member?.familyId ?? null;
}

/** The user's role in a family, or null when not a member. */
export async function getFamilyMemberRole(
	userId: string,
	familyId: string
): Promise<string | null> {
	const [member] = await db
		.select({ role: familyMembers.role })
		.from(familyMembers)
		.where(and(eq(familyMembers.userId, userId), eq(familyMembers.familyId, familyId)));
	return member?.role ?? null;
}

/** Full roster of a family with user info. Canonical shape. */
export async function getFamilyRoster(familyId: string): Promise<
	{
		userId: string;
		firstName: string;
		lastName: string;
		email: string | null;
		role: string | null;
		memberType: string | null;
	}[]
> {
	return await db
		.select({
			userId: familyMembers.userId,
			firstName: users.firstName,
			lastName: users.lastName,
			email: users.email,
			role: familyMembers.role,
			memberType: familyMembers.memberType
		})
		.from(familyMembers)
		.innerJoin(users, eq(familyMembers.userId, users.id))
		.where(eq(familyMembers.familyId, familyId));
}

export async function getFamilyInviteCodes(familyId: string) {
	return await db.select().from(familyInviteCodes).where(eq(familyInviteCodes.familyId, familyId));
}

/**
 * Remove a member from a family. One transaction: dropping the roster row
 * also un-assigns that member's family tasks (assignedTo → null, pending
 * status → 'none'). The `assignedTo` leg of canMutateTask would otherwise
 * keep granting the removed member write access — the FK only set-nulls on
 * user DELETE, not on family removal.
 */
export async function removeFamilyMember(familyId: string, userId: string) {
	await db.transaction(async (tx) => {
		await tx
			.update(tasks)
			.set({ assignedTo: null, assignmentStatus: 'none' })
			.where(and(eq(tasks.familyId, familyId), eq(tasks.assignedTo, userId)));
		await tx.execute(
			sql`DELETE FROM "familyMembers" WHERE "family_id" = ${familyId} AND "user_id" = ${userId}`
		);
	});
}

export async function deleteInviteCode(code: string) {
	await db.delete(familyInviteCodes).where(eq(familyInviteCodes.code, code));
}

/** Escape ILIKE wildcards so a search term only matches itself. */
function escapeIlike(value: string): string {
	return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Exact-match directory lookup for invites: an exact case-insensitive email,
 * or an exact first+last name pair. Deliberately NOT a substring scan — a
 * wildcard search would let any family member enumerate every verified user
 * one letter at a time.
 */
export async function searchUsers(query: string, familyId: string) {
	const exact = escapeIlike(query.trim());

	const existingMembers = await db
		.select({ userId: familyMembers.userId })
		.from(familyMembers)
		.where(eq(familyMembers.familyId, familyId));

	const excludeUserIds = existingMembers.map((m) => m.userId);

	return await db
		.select({
			id: users.id,
			firstName: users.firstName,
			lastName: users.lastName,
			email: users.email
		})
		.from(users)
		.where(
			and(
				eq(users.emailVerified, true),
				excludeUserIds.length > 0 ? notInArray(users.id, excludeUserIds) : undefined,
				or(
					ilike(users.email, exact),
					and(ilike(users.firstName, exact), ilike(users.lastName, exact))
				)
			)
		)
		.limit(10);
}
