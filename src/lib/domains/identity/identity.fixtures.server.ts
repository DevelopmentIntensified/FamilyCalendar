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
 * leave their timestamps to the column defaults (`defaultNow()`) unless a test
 * overrides them.
 *
 *   await seedIdentitySettings(user.id);                         // committed goldens
 *   await seedIdentitySettings(user.id, { timeZone: 'UTC' }, db); // inside rollbackTest
 *
 * Every builder takes an optional trailing `db` (the family precedent). It
 * defaults to the committed test database, which is what the golden's calls
 * rely on; a `rollbackTest` passes its transaction so the rows vanish with it.
 *
 * Doc: ./README.md#how-to-test
 */
import type { Db } from '$lib/kernel/db/database.server';
import {
	accounts,
	adConsentRecords,
	apiTokens,
	authSession,
	calendars,
	codes,
	families,
	familyMembers,
	userSettings,
	type AdConsentDecision,
	type NewAuthSessionRow,
	type NewCodeRow
} from '$lib/kernel/db/tables.server';
import { testDb } from '$lib/kernel/testing/testDb.server';

/** The instant the settings, token and consent builders write; goldens assert this exact string. */
export const IDENTITY_SEEDED_AT = '2026-10-07T13:00:00.000Z';
const seededAt = new Date(IDENTITY_SEEDED_AT);

/** The stored settings row the settings tests merge onto. */
export async function seedIdentitySettings(
	userId: string,
	overrides: Partial<typeof userSettings.$inferInsert> = {},
	db: Db = testDb()
) {
	const [row] = await db
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
	overrides: Partial<typeof userSettings.$inferInsert> = {},
	db: Db = testDb()
) {
	const [row] = await db
		.insert(userSettings)
		.values({ userId, timeZone: 'UTC', updatedAt: seededAt, ...overrides })
		.returning();
	return row;
}

export async function seedIdentityApiToken(
	userId: string,
	overrides: Partial<typeof apiTokens.$inferInsert> = {},
	db: Db = testDb()
) {
	const [row] = await db
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

/** A live web session (expires 2030); `token` defaults to `token-<id>`. */
export async function seedIdentitySession(
	userId: string,
	id: string,
	overrides: Partial<NewAuthSessionRow> = {},
	db: Db = testDb()
) {
	const [row] = await db
		.insert(authSession)
		.values({
			id,
			token: `token-${id}`,
			userId,
			expiresAt: new Date('2030-01-01T00:00:00.000Z'),
			...overrides
		})
		.returning();
	return row;
}

/**
 * A real calendars row. `defaultCalendarId` has a FK, so a dangling id cannot
 * be stored; `familyId` makes it a family calendar, which the default-calendar
 * check accepts only for a member (`calendarScope.ts:12-29`).
 */
export async function seedIdentityCalendar(
	ownerId: string | null,
	id: string,
	options: { familyId?: string } = {},
	db: Db = testDb()
) {
	await db.insert(calendars).values({ id, ownerId, familyId: options.familyId ?? null });
}

/** The family row plus the membership the default-calendar access check reads. */
export async function seedIdentityFamily(
	userId: string,
	familyId: string,
	name = 'Home',
	db: Db = testDb()
) {
	await db.insert(families).values({ id: familyId, name });
	await db.insert(familyMembers).values({ userId, familyId });
}

/** One consent-trail row at an explicit instant — the trail is append-only and read newest-first. */
export async function seedIdentityConsent(
	userId: string,
	decision: AdConsentDecision,
	recordedAt: string,
	db: Db = testDb()
) {
	await db
		.insert(adConsentRecords)
		.values({ userId, decision, recordedAt: new Date(recordedAt) });
}

/**
 * One `codes` row exactly as given: pass `code` as stored — the keyed digest
 * (`emailCodeKey(input, TEST_CODE_PEPPER).codeHash`, i.e. HMAC-SHA-256 with the
 * test pepper) every kind uses, the email-change code and the reset marker
 * included (Q-116, Q-117). Expires in 2099 unless overridden.
 */
export async function seedIdentityEmailCode(
	values: Pick<NewCodeRow, 'code' | 'email'> & Partial<NewCodeRow>,
	db: Db = testDb()
) {
	const [row] = await db
		.insert(codes)
		.values({ expiresAt: new Date('2099-01-01T00:00:00.000Z'), ...values })
		.returning();
	return row;
}

/** A provider `accounts` row: the email-keyed binding a sign-in looks up first. */
export async function seedIdentityAccountBinding(
	userId: string,
	providerAccountId: string,
	provider = 'email',
	db: Db = testDb()
) {
	const [row] = await db
		.insert(accounts)
		.values({ userId, provider, providerAccountId })
		.returning();
	return row;
}
