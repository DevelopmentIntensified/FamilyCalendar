import { db } from '$lib/server/db';
import { userSettings, type UserSettings } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export async function getUserSettings(userId: string) {
	const [UserSettings] = await db
		.select()
		.from(userSettings)
		.where(eq(userSettings.userId, userId));
	return UserSettings;
}

export async function createUserSettings(data: typeof userSettings.$inferInsert) {
	const [createdUserSettings] = await db.insert(userSettings).values(data).returning();
	return createdUserSettings;
}

export async function updateUserSettings(userId: string, data: Partial<Omit<UserSettings, 'id'>>) {
	const [updatedUserSettings] = await db
		.update(userSettings)
		.set(data)
		.where(eq(userSettings.userId, userId))
		.returning();
	return updatedUserSettings;
}

export async function deleteUserSettings(userId: string) {
	await db.delete(userSettings).where(eq(userSettings.userId, userId));
}
