/**
 * Row builders for identity's db tests. Kept out of the goldens so the wire
 * test states only what a client sees and every future service/repo test
 * seeds the same legal rows. Three reasons a builder exists here:
 * `defaultCalendarId` is a real FK (`seedIdentityCalendar`), the default
 * calendar is accepted only when the caller can see it — personal or family
 * (`seedIdentityFamily`), and a sign-up creates a sparse settings row that a
 * plain default-carrying insert cannot reproduce (`seedIdentitySparseSettings`).
 *
 * The settings, token and consent builders write `IDENTITY_SEEDED_AT`, so a
 * golden pins the exact wire rendering of `updatedAt`/`createdAt`/`lastUsedAt`/
 * `recordedAt` instead of a shape; the session, calendar and family builders
 * leave their timestamps to the column defaults (`defaultNow()`).
 *
 * Doc: ./README.md#how-to-test
 */
import {
	adConsentRecords,
	apiTokens,
	authSession,
	calendars,
	families,
	familyMembers,
	userSettings,
	type AdConsentDecision
} from '$lib/kernel/db/tables.server';
import { testDb } from '$lib/kernel/testing/testDb.server';

/** The instant the settings, token and consent builders write; goldens assert this exact string. */
export const IDENTITY_SEEDED_AT = '2026-10-07T13:00:00.000Z';
const seededAt = new Date(IDENTITY_SEEDED_AT);

/** The stored settings row the settings tests merge onto. */
export async function seedIdentitySettings(
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
			// that need one seed it explicitly with seedIdentityCalendar().
			defaultCalendarId: null,
			syncEventsToFamilyCalendar: true,
			autoParseEventDetails: false,
			showDailyVerse: true,
			showAdsAsEvents: false,
			verseTranslation: 'esv',
			hiddenDashboardModules: ['board'],
			useCloudAI: true,
			useLocalAI: true,
			updatedAt: seededAt,
			...overrides
		})
		.returning();
	return row;
}

/**
 * A row exactly as the sign-up paths create it — `{userId, timeZone:'UTC'}`
 * and nothing else (`src/lib/server/db/actions/users.ts:138`,
 * `src/lib/server/services/mobileAuth.ts:327`): every column with a default
 * takes it, `color` and `syncEventsToFamilyCalendar` stay null.
 */
export async function seedIdentitySparseSettings(
	userId: string,
	overrides: Partial<typeof userSettings.$inferInsert> = {}
) {
	const [row] = await testDb()
		.insert(userSettings)
		.values({ userId, timeZone: 'UTC', updatedAt: seededAt, ...overrides })
		.returning();
	return row;
}

export async function seedIdentityApiToken(
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
			createdAt: seededAt,
			...overrides
		})
		.returning();
	return row;
}

export async function seedIdentitySession(userId: string, id: string) {
	await testDb()
		.insert(authSession)
		.values({
			id,
			token: `token-${id}`,
			userId,
			expiresAt: new Date('2030-01-01T00:00:00.000Z')
		});
}

/**
 * A real calendars row. `defaultCalendarId` has a FK, so a dangling id cannot
 * be stored; `familyId` makes it a family calendar, which the default-calendar
 * check accepts only for a member (`calendarScope.ts:12-29`).
 */
export async function seedIdentityCalendar(
	ownerId: string | null,
	id: string,
	options: { familyId?: string } = {}
) {
	await testDb()
		.insert(calendars)
		.values({ id, ownerId, familyId: options.familyId ?? null });
}

/** The family row plus the membership the default-calendar access check reads. */
export async function seedIdentityFamily(userId: string, familyId: string, name = 'Home') {
	await testDb().insert(families).values({ id: familyId, name });
	await testDb().insert(familyMembers).values({ userId, familyId });
}

/** One consent-trail row at an explicit instant — the trail is append-only and read newest-first. */
export async function seedIdentityConsent(
	userId: string,
	decision: AdConsentDecision,
	recordedAt: string
) {
	await testDb()
		.insert(adConsentRecords)
		.values({ userId, decision, recordedAt: new Date(recordedAt) });
}
