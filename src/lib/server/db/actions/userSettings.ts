import { db } from '$lib/server/db';
import { userSettings, type UserSettings } from '$lib/server/db/schema';
import { pickWritableFields } from '$lib/server/utils/pickWritableFields';
import { eq } from 'drizzle-orm';

// #168: explicit allowlist (not Omit) — a new column stays non-writable here
// until it is added to this list on purpose.
const SETTING_UPDATE_FIELDS = [
	'weekStart',
	'timeZone',
	'color',
	'syncEventsToFamilyCalendar',
	'showAdsAsEvents',
	'autoParseEventDetails',
	'showDailyVerse',
	'verseTranslation',
	'hiddenDashboardModules',
	'defaultCalendarId',
	'defaultView'
] as const;

export type UserSettingsUpdateData = Partial<
	Pick<UserSettings, (typeof SETTING_UPDATE_FIELDS)[number]>
>;

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

export async function updateUserSettings(
	userId: string,
	data: UserSettingsUpdateData
) {
	const [updatedUserSettings] = await db
		.update(userSettings)
		.set(pickWritableFields(data, SETTING_UPDATE_FIELDS))
		.where(eq(userSettings.userId, userId))
		.returning();
	return updatedUserSettings;
}

export async function deleteUserSettings(userId: string) {
	await db.delete(userSettings).where(eq(userSettings.userId, userId));
}
