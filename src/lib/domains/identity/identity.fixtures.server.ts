/**
 * Row builders for identity's db tests. Kept out of the goldens so the wire
 * test states only what a client sees and every future service/repo test
 * seeds the same legal rows (the settings FK to `calendars` is the reason
 * `seedCalendar` exists at all).
 *
 * Doc: ./README.md#how-to-test
 */
import { apiTokens, authSession, calendars, userSettings } from '$lib/kernel/db/tables.server';
import { testDb } from '$lib/kernel/testing/testDb.server';

/** The stored settings row the settings tests merge onto. */
export async function seedCalendarSettings(
	userId: string,
	overrides: Partial<typeof userSettings.$inferInsert> = {}
) {
	const [row] = await testDb()
		.insert(userSettings)
		.values({
			id: 'settings-a',
			userId,
			weekStart: 'monday',
			timeZone: 'America/Chicago',
			color: '#112233',
			defaultView: 'dashboard',
			// A stored default calendar must be a real calendars row (FK): tests
			// that need one seed it explicitly with seedCalendar().
			defaultCalendarId: null,
			syncEventsToFamilyCalendar: true,
			autoParseEventDetails: false,
			showDailyVerse: true,
			showAdsAsEvents: false,
			verseTranslation: 'esv',
			hiddenDashboardModules: ['board'],
			useCloudAI: true,
			useLocalAI: true,
			...overrides
		})
		.returning();
	return row;
}

export async function seedApiToken(
	userId: string,
	overrides: Partial<typeof apiTokens.$inferInsert> = {}
) {
	const [row] = await testDb()
		.insert(apiTokens)
		.values({
			id: 'tok-a',
			userId,
			name: 'Phone',
			tokenHash: 'seed-token-hash',
			...overrides
		})
		.returning();
	return row;
}

export async function seedSession(userId: string, id: string) {
	await testDb()
		.insert(authSession)
		.values({
			id,
			token: `token-${id}`,
			userId,
			expiresAt: new Date('2030-01-01T00:00:00.000Z')
		});
}

/** A real calendars row: `defaultCalendarId` has a FK, so a dangling id cannot be stored. */
export async function seedCalendar(ownerId: string, id: string) {
	await testDb().insert(calendars).values({ id, ownerId });
}
