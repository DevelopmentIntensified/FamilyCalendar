import { db } from '$lib/server/db';
import {
	calendars,
	families,
	familyMembers,
	familyInviteCodes,
	users,
	type Family,
	type FamilyInviteCode
} from '$lib/server/db/schema';
import { count, eq, and, gt, ilike, or, sql } from 'drizzle-orm';
import { generateId } from 'lucia';

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

export async function getUserFamilies(userId: string) {
	const [member] = await db
		.select()
		.from(familyMembers)
		.where(eq(familyMembers.userId, userId));
	
	if (!member) return null;
	
	const family = member.familyId
		? (await db.select().from(families).where(eq(families.id, member.familyId)))[0]
		: null;
	
	return { families: family, familyMembers: member };
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
			maxUses: options?.maxUses ?? 1,
			useCount: 0,
			createdBy: options?.createdBy
		})
		.returning();

	return inviteCode;
}

export async function verifyInviteCode(code: string): Promise<{ family: Family; inviteCode: FamilyInviteCode } | null> {
	const [inviteCode] = await db
		.select()
		.from(familyInviteCodes)
		.where(
			and(
				eq(familyInviteCodes.code, code),
				gt(familyInviteCodes.expiresAt, new Date())
			)
		);

	if (!inviteCode) return null;

	const [family] = await db.select().from(families).where(eq(families.id, inviteCode.familyId));
	if (!family) return null;

	if (inviteCode.maxUses !== null && inviteCode.useCount !== null && inviteCode.useCount >= inviteCode.maxUses) {
		return null;
	}

	return { family, inviteCode };
}

export async function acceptInvite(userId: string, code: string): Promise<boolean> {
	const verification = await verifyInviteCode(code);
	if (!verification) return false;

	const [existing] = await db
		.select()
		.from(familyMembers)
		.where(
			and(
				eq(familyMembers.userId, userId),
				eq(familyMembers.familyId, verification.family.id)
			)
		);

	if (existing) return false;

	await db.insert(familyMembers).values({
		userId,
		familyId: verification.family.id
	});

	await db
		.update(familyInviteCodes)
	.set({ useCount: (verification.inviteCode.useCount ?? 0) + 1 })
		.where(eq(familyInviteCodes.code, code));

	return true;
}

/** The user's family id, or null. Single-membership assumption. */
export async function getUserFamilyId(userId: string): Promise<string | null> {
	const [member] = await db
		.select({ familyId: familyMembers.familyId })
		.from(familyMembers)
		.where(eq(familyMembers.userId, userId));
	return member?.familyId ?? null;
}

/** Full roster of a family with user info. Canonical shape. */
export async function getFamilyRoster(
	familyId: string
): Promise<
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
	return await db
		.select()
		.from(familyInviteCodes)
		.where(eq(familyInviteCodes.familyId, familyId));
}

export async function removeFamilyMember(familyId: string, userId: string) {
	await db.execute(sql`DELETE FROM "familyMembers" WHERE "family_id" = ${familyId} AND "user_id" = ${userId}`);
}

export async function deleteInviteCode(code: string) {
	await db.delete(familyInviteCodes).where(eq(familyInviteCodes.code, code));
}

export async function searchUsers(query: string, familyId: string) {
	const lowerQuery = `%${query.toLowerCase()}%`;

	const existingMembers = await db
		.select({ userId: familyMembers.userId })
		.from(familyMembers)
		.where(eq(familyMembers.familyId, familyId));

	const excludeUserIds = existingMembers.map(m => m.userId);

	if (excludeUserIds.length === 0) {
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
					or(
						ilike(users.email, lowerQuery),
						ilike(users.firstName, lowerQuery),
						ilike(users.lastName, lowerQuery),
						sql`${users.firstName} || ' ' || ${users.lastName} ILIKE ${lowerQuery}`
					)
				)
			)
			.limit(10);
	}

	const placeholders = excludeUserIds.map(() => sql`id != ${excludeUserIds[excludeUserIds.indexOf(excludeUserIds[0])]}`);

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
				sql`${users.id} NOT IN (${sql.join(excludeUserIds.map(id => sql`${id}`), sql`, `)})`,
				or(
					ilike(users.email, lowerQuery),
					ilike(users.firstName, lowerQuery),
					ilike(users.lastName, lowerQuery),
					sql`${users.firstName} || ' ' || ${users.lastName} ILIKE ${lowerQuery}`
				)
			)
		)
		.limit(10);
}
