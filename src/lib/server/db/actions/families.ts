import { db } from '$lib/server/db';
import {
	calendars,
	families,
	familyMembers,
	familyInviteCodes,
	type Family,
	type FamilyInviteCode
} from '$lib/server/db/schema';
import { count, eq, and, gt } from 'drizzle-orm';
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
	const [userFamily] = await db
		.select()
		.from(familyMembers)
		.leftJoin(families, eq(families.id, familyMembers.familyId))
		.where(eq(familyMembers.userId, userId));
	return userFamily;
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

export async function getFamilyInviteCodes(familyId: string) {
	return await db
		.select()
		.from(familyInviteCodes)
		.where(eq(familyInviteCodes.familyId, familyId));
}
