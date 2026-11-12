/**
 * Golden contract tests for identity's `/api/me/*` endpoints: the session
 * cookie / Bearer wire around the person, their calendar settings, their
 * sessions and their personal `fp_` API tokens.
 *
 * They run against the LEGACY route handlers today and must stay green,
 * unchanged, after the port (docs/rewrite/playbooks/characterize-endpoints.md).
 * Committed mode (`truncateAll`), because legacy handlers write through the
 * `db` singleton outside any test transaction.
 *
 * Doc: ./README.md#how-to-test
 */
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
	adConsentRecords,
	apiTokens,
	authSession,
	userSettings,
	users
} from '$lib/kernel/db/tables.server';
import { invoke } from '$lib/kernel/testing/invokeHandlers.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { testDb, truncateAll } from '$lib/kernel/testing/testDb.server';
import type { JsonValue } from '$lib/kernel/validation/validators';
import {
	seedApiToken,
	seedCalendar,
	seedCalendarSettings,
	seedSession
} from './identity.fixtures.server';
// The ROUTE modules, not the legacy services: after the port these files
// re-export the new handlers, so this import never changes.
import { GET as listTokens, POST as createToken } from '../../../routes/api/me/api-tokens/+server';
import { DELETE as revokeToken } from '../../../routes/api/me/api-tokens/[id]/+server';
import { PATCH as patchProfile } from '../../../routes/api/me/profile/+server';
import { POST as revokeOtherSessions } from '../../../routes/api/me/sessions/revoke-others/+server';
import {
	GET as getSettings,
	PATCH as patchSettings
} from '../../../routes/api/me/settings/+server';

/** ISO instant matcher: generated timestamps are asserted by shape only. */
const iso = () => expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

const VERSE_TRANSLATIONS = [{ id: 'esv', label: 'ESV', attribution: 'Public domain.' }];

beforeEach(truncateAll);

describe('GET /api/me/api-tokens', () => {
	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const res = await invoke(listTokens, {
			ctx: testCtx({ db: testDb() }),
			path: '/api/me/api-tokens'
		});
		expect(res).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
	});

	it('lists your tokens with id, name, createdAt and lastUsedAt — never the hash', async () => {
		const user = await seedUser(testDb());
		await seedApiToken(user.id);
		const res = await invoke(listTokens, {
			ctx: testCtx({ db: testDb() }),
			user,
			path: '/api/me/api-tokens'
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			tokens: [{ id: 'tok-a', name: 'Phone', createdAt: iso(), lastUsedAt: null }]
		});
	});

	it('never returns another person’s tokens', async () => {
		const user = await seedUser(testDb());
		const other = await seedUser(testDb());
		await seedApiToken(other.id, { id: 'tok-b', name: 'Their phone' });
		const res = await invoke(listTokens, {
			ctx: testCtx({ db: testDb() }),
			user,
			path: '/api/me/api-tokens'
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ tokens: [] });
	});
});

describe('POST /api/me/api-tokens', () => {
	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const res = await invoke(createToken, {
			ctx: testCtx({ db: testDb() }),
			path: '/api/me/api-tokens',
			body: { name: 'Phone' }
		});
		expect(res).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
	});

	it('mints an fp_ token, answers 201 with the plaintext once and stores only its SHA-256', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(createToken, {
			ctx: testCtx({ db: testDb() }),
			user,
			path: '/api/me/api-tokens',
			body: { name: '  My phone  ' }
		});
		expect(res.status).toBe(201);
		expect(res.body).toEqual({
			token: expect.stringMatching(/^fp_[A-Za-z0-9_-]{43}$/),
			record: { id: expect.any(String), name: 'My phone', createdAt: iso() }
		});
		const body = res.body as { token: string; record: { id: string } };
		const rows = await testDb().select().from(apiTokens).where(eq(apiTokens.userId, user.id));
		expect(rows).toHaveLength(1);
		expect(rows[0].id).toBe(body.record.id);
		expect(rows[0].name).toBe('My phone');
		expect(rows[0].tokenHash).toBe(createHash('sha256').update(body.token).digest('hex'));
		expect(rows[0].tokenHash).not.toContain(body.token);
		expect(rows[0].lastUsedAt).toBeNull();
	});

	it('keeps at most 60 characters of the name', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(createToken, {
			ctx: testCtx({ db: testDb() }),
			user,
			path: '/api/me/api-tokens',
			body: { name: 'x'.repeat(70) }
		});
		expect(res.status).toBe(201);
		const body = res.body as { record: { name: string } };
		expect(body.record.name).toHaveLength(60);
		const rows = await testDb().select().from(apiTokens).where(eq(apiTokens.userId, user.id));
		expect(rows[0].name).toHaveLength(60);
	});

	it('refuses an absent name with the legacy message (an empty body reads as {})', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(createToken, {
			ctx: testCtx({ db: testDb() }),
			user,
			path: '/api/me/api-tokens',
			rawBody: ''
		});
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'Token name is required' });
	});

	it('refuses a whitespace-only name with the legacy message', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(createToken, {
			ctx: testCtx({ db: testDb() }),
			user,
			path: '/api/me/api-tokens',
			body: { name: '   ' }
		});
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'Token name is required' });
	});

	it('refuses a non-string name with the legacy message', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(createToken, {
			ctx: testCtx({ db: testDb() }),
			user,
			path: '/api/me/api-tokens',
			body: { name: 42 }
		});
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'Token name is required' });
	});

	it('answers 400 {"error":"Invalid JSON"} for a malformed body', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(createToken, {
			ctx: testCtx({ db: testDb() }),
			user,
			path: '/api/me/api-tokens',
			rawBody: '{nope'
		});
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'Invalid JSON' });
	});

	it('answers 400 {"error":"Invalid JSON"} for a JSON array (not an object)', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(createToken, {
			ctx: testCtx({ db: testDb() }),
			user,
			path: '/api/me/api-tokens',
			body: [1]
		});
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'Invalid JSON' });
	});
});

describe('DELETE /api/me/api-tokens/:id', () => {
	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const res = await invoke(revokeToken, {
			ctx: testCtx({ db: testDb() }),
			path: '/api/me/api-tokens/tok-a',
			params: { id: 'tok-a' }
		});
		expect(res).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
	});

	it('revokes your own token and answers {success:true}', async () => {
		const user = await seedUser(testDb());
		await seedApiToken(user.id);
		const res = await invoke(revokeToken, {
			ctx: testCtx({ db: testDb() }),
			user,
			path: '/api/me/api-tokens/tok-a',
			params: { id: 'tok-a' }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true });
		const rows = await testDb().select().from(apiTokens).where(eq(apiTokens.userId, user.id));
		expect(rows).toEqual([]);
	});

	it('is owner-scoped: another person’s id deletes nothing and still answers {success:true}', async () => {
		const user = await seedUser(testDb());
		const other = await seedUser(testDb());
		await seedApiToken(other.id, { id: 'tok-b', name: 'Their phone' });
		const res = await invoke(revokeToken, {
			ctx: testCtx({ db: testDb() }),
			user,
			path: '/api/me/api-tokens/tok-b',
			params: { id: 'tok-b' }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true });
		const rows = await testDb().select().from(apiTokens).where(eq(apiTokens.id, 'tok-b'));
		expect(rows).toHaveLength(1);
	});

	it('an unknown id is the same 200, so ids cannot be probed', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(revokeToken, {
			ctx: testCtx({ db: testDb() }),
			user,
			path: '/api/me/api-tokens/nope',
			params: { id: 'nope' }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true });
	});

	it('answers 400 {"error":"Token id is required"} for an empty id', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(revokeToken, {
			ctx: testCtx({ db: testDb() }),
			user,
			path: '/api/me/api-tokens/',
			params: { id: '' }
		});
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'Token id is required' });
	});
});

describe('PATCH /api/me/profile', () => {
	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const res = await invoke(patchProfile, {
			ctx: testCtx({ db: testDb() }),
			path: '/api/me/profile',
			body: { firstName: 'Mia', lastName: 'Lopez' }
		});
		expect(res).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
	});

	it('trims both names, writes them and echoes them with the email', async () => {
		const user = await seedUser(testDb(), { firstName: 'Old', lastName: 'Name' });
		const res = await invoke(patchProfile, {
			ctx: testCtx({ db: testDb() }),
			user,
			path: '/api/me/profile',
			body: { firstName: '  Mia  ', lastName: '  Lopez  ' }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			success: true,
			user: { id: user.id, firstName: 'Mia', lastName: 'Lopez', email: user.email }
		});
		const [row] = await testDb().select().from(users).where(eq(users.id, user.id));
		expect([row.firstName, row.lastName]).toEqual(['Mia', 'Lopez']);
	});

	it('masks an Anonymous Account’s placeholder email to null', async () => {
		const guest = await seedUser(testDb(), {
			email: 'guest@anonymous.placeholder.invalid'
		});
		const res = await invoke(patchProfile, {
			ctx: testCtx({ db: testDb() }),
			user: guest,
			path: '/api/me/profile',
			body: { firstName: 'Guest', lastName: 'Person' }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			success: true,
			user: { id: guest.id, firstName: 'Guest', lastName: 'Person', email: null }
		});
	});

	it('refuses an absent last name with the legacy message', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(patchProfile, {
			ctx: testCtx({ db: testDb() }),
			user,
			path: '/api/me/profile',
			body: { firstName: 'Mia' }
		});
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'First name and last name are required' });
	});

	it('refuses a non-string name and writes nothing', async () => {
		const user = await seedUser(testDb(), { firstName: 'Unchanged', lastName: 'Person' });
		const res = await invoke(patchProfile, {
			ctx: testCtx({ db: testDb() }),
			user,
			path: '/api/me/profile',
			body: { firstName: 5, lastName: 'Lopez' }
		});
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'First name and last name are required' });
		const [row] = await testDb().select().from(users).where(eq(users.id, user.id));
		expect([row.firstName, row.lastName]).toEqual(['Unchanged', 'Person']);
	});

	it('answers 400 {"error":"Invalid JSON"} for a malformed body', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(patchProfile, {
			ctx: testCtx({ db: testDb() }),
			user,
			path: '/api/me/profile',
			rawBody: '{nope'
		});
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'Invalid JSON' });
	});
});

describe('POST /api/me/sessions/revoke-others', () => {
	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const res = await invoke(revokeOtherSessions, {
			ctx: testCtx({ db: testDb() }),
			path: '/api/me/sessions/revoke-others'
		});
		expect(res).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
	});

	it('revokes every web session of the caller, leaves other people and API tokens alone', async () => {
		const user = await seedUser(testDb());
		const other = await seedUser(testDb());
		await seedSession(user.id, 'sess-a');
		await seedSession(user.id, 'sess-b');
		await seedSession(other.id, 'sess-other');
		await seedApiToken(user.id, { id: 'tok-a' });
		await seedApiToken(other.id, { id: 'tok-b', tokenHash: 'other-token-hash' });

		const res = await invoke(revokeOtherSessions, {
			ctx: testCtx({ db: testDb() }),
			user,
			path: '/api/me/sessions/revoke-others'
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true, revoked: 2 });

		const sessions = await testDb().select().from(authSession);
		expect(sessions.map((row) => row.id)).toEqual(['sess-other']);
		const tokens = await testDb().select().from(apiTokens);
		expect(tokens.map((row) => row.id).sort()).toEqual(['tok-a', 'tok-b']);
	});

	it('a Bearer caller (no cookie session) signs out every web session too', async () => {
		const user = await seedUser(testDb());
		await seedSession(user.id, 'sess-a');
		const res = await invoke(revokeOtherSessions, {
			ctx: testCtx({ db: testDb() }),
			user,
			via: 'token',
			path: '/api/me/sessions/revoke-others'
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true, revoked: 1 });
		const sessions = await testDb().select().from(authSession).where(eq(authSession.userId, user.id));
		expect(sessions).toEqual([]);
	});
});

describe('GET /api/me/settings', () => {
	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const res = await invoke(getSettings, {
			ctx: testCtx({ db: testDb() }),
			path: '/api/me/settings'
		});
		expect(res).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
	});

	it('answers the page defaults when the person has no settings row', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(getSettings, {
			ctx: testCtx({ db: testDb() }),
			user,
			path: '/api/me/settings'
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			settings: {
				weekStart: 'sunday',
				timeZone: 'UTC',
				color: '#3b82f6',
				defaultView: 'dayView',
				defaultCalendarId: null,
				syncEventsToFamilyCalendar: false,
				showAdsAsEvents: false,
				verseTranslation: 'esv'
			},
			verseTranslations: VERSE_TRANSLATIONS,
			consentHistory: []
		});
	});

	it('answers the stored row, the translation options and the consent trail', async () => {
		const user = await seedUser(testDb());
		await seedCalendar(user.id, 'cal-mine');
		await seedCalendarSettings(user.id, { defaultCalendarId: 'cal-mine' });
		await testDb().insert(adConsentRecords).values({ userId: user.id, decision: 'granted' });
		const res = await invoke(getSettings, {
			ctx: testCtx({ db: testDb() }),
			user,
			path: '/api/me/settings'
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			settings: {
				id: 'settings-a',
				userId: user.id,
				weekStart: 'monday',
				timeZone: 'America/Chicago',
				color: '#112233',
				defaultView: 'dashboard',
				defaultCalendarId: 'cal-mine',
				syncEventsToFamilyCalendar: true,
				autoParseEventDetails: false,
				showDailyVerse: true,
				showAdsAsEvents: false,
				verseTranslation: 'esv',
				hiddenDashboardModules: ['board'],
				useCloudAI: true,
				useLocalAI: true,
				updatedAt: iso()
			},
			verseTranslations: VERSE_TRANSLATIONS,
			consentHistory: [{ decision: 'granted', recordedAt: iso() }]
		});
	});
});

describe('PATCH /api/me/settings', () => {
	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const res = await invoke(patchSettings, {
			ctx: testCtx({ db: testDb() }),
			path: '/api/me/settings',
			body: { timeZone: 'UTC' }
		});
		expect(res).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
	});

	it('timeZone alone keeps every other stored field (and skips the stale default-calendar check)', async () => {
		const user = await seedUser(testDb());
		const other = await seedUser(testDb());
		// Owned by another person, in no family of the caller: a real but
		// inaccessible default calendar — the stale id this test must keep.
		await seedCalendar(other.id, 'cal-their-calendar');
		await seedCalendarSettings(user.id, { defaultCalendarId: 'cal-their-calendar' });
		const res = await invoke(patchSettings, {
			ctx: testCtx({ db: testDb() }),
			user,
			path: '/api/me/settings',
			body: { timeZone: 'Asia/Tokyo' }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			settings: {
				id: 'settings-a',
				userId: user.id,
				weekStart: 'monday',
				timeZone: 'Asia/Tokyo',
				color: '#112233',
				defaultView: 'dashboard',
				defaultCalendarId: 'cal-their-calendar',
				syncEventsToFamilyCalendar: true,
				autoParseEventDetails: false,
				showDailyVerse: true,
				showAdsAsEvents: false,
				verseTranslation: 'esv',
				hiddenDashboardModules: ['board'],
				useCloudAI: true,
				useLocalAI: true,
				updatedAt: iso()
			},
			verseTranslations: VERSE_TRANSLATIONS,
			consentHistory: []
		});
		const [row] = await testDb().select().from(userSettings).where(eq(userSettings.userId, user.id));
		expect(row.timeZone).toBe('Asia/Tokyo');
		expect(row.defaultCalendarId).toBe('cal-their-calendar');
	});

	it('creates the row from the page defaults plus the patch when none exists', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(patchSettings, {
			ctx: testCtx({ db: testDb() }),
			user,
			path: '/api/me/settings',
			body: { defaultView: 'monthView' }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			settings: {
				id: expect.any(String),
				userId: user.id,
				weekStart: 'sunday',
				timeZone: 'UTC',
				color: '#3b82f6',
				defaultView: 'monthView',
				defaultCalendarId: null,
				syncEventsToFamilyCalendar: false,
				autoParseEventDetails: true,
				showDailyVerse: false,
				showAdsAsEvents: false,
				verseTranslation: 'esv',
				hiddenDashboardModules: null,
				useCloudAI: true,
				useLocalAI: true,
				updatedAt: iso()
			},
			verseTranslations: VERSE_TRANSLATIONS,
			consentHistory: []
		});
		const rows = await testDb().select().from(userSettings).where(eq(userSettings.userId, user.id));
		expect(rows).toHaveLength(1);
		expect(rows[0].id).toHaveLength(15);
	});

	it('accepts defaultCalendarId:null and stores null', async () => {
		const user = await seedUser(testDb());
		await seedCalendar(user.id, 'cal-mine');
		await seedCalendarSettings(user.id, { defaultCalendarId: 'cal-mine' });
		const res = await invoke(patchSettings, {
			ctx: testCtx({ db: testDb() }),
			user,
			path: '/api/me/settings',
			body: { defaultCalendarId: null }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			settings: {
				id: 'settings-a',
				userId: user.id,
				weekStart: 'monday',
				timeZone: 'America/Chicago',
				color: '#112233',
				defaultView: 'dashboard',
				defaultCalendarId: null,
				syncEventsToFamilyCalendar: true,
				autoParseEventDetails: false,
				showDailyVerse: true,
				showAdsAsEvents: false,
				verseTranslation: 'esv',
				hiddenDashboardModules: ['board'],
				useCloudAI: true,
				useLocalAI: true,
				updatedAt: iso()
			},
			verseTranslations: VERSE_TRANSLATIONS,
			consentHistory: []
		});
		const [row] = await testDb().select().from(userSettings).where(eq(userSettings.userId, user.id));
		expect(row.defaultCalendarId).toBeNull();
	});

	it('keeps the stored row when a newly set default calendar is not accessible', async () => {
		const user = await seedUser(testDb());
		const other = await seedUser(testDb());
		await seedCalendar(user.id, 'cal-mine');
		await seedCalendar(other.id, 'cal-their-calendar');
		await seedCalendarSettings(user.id, { defaultCalendarId: 'cal-mine' });
		const res = await invoke(patchSettings, {
			ctx: testCtx({ db: testDb() }),
			user,
			path: '/api/me/settings',
			body: { defaultCalendarId: 'cal-their-calendar' }
		});
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'Selected default calendar is not available' });
		const [row] = await testDb().select().from(userSettings).where(eq(userSettings.userId, user.id));
		expect(row.defaultCalendarId).toBe('cal-mine');
	});

	it('records the ad-consent transition when showAdsAsEvents turns on', async () => {
		const user = await seedUser(testDb());
		await seedCalendarSettings(user.id, { showAdsAsEvents: false });
		const res = await invoke(patchSettings, {
			ctx: testCtx({ db: testDb() }),
			user,
			path: '/api/me/settings',
			body: { showAdsAsEvents: true }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			settings: {
				id: 'settings-a',
				userId: user.id,
				weekStart: 'monday',
				timeZone: 'America/Chicago',
				color: '#112233',
				defaultView: 'dashboard',
				defaultCalendarId: null,
				syncEventsToFamilyCalendar: true,
				autoParseEventDetails: false,
				showDailyVerse: true,
				showAdsAsEvents: true,
				verseTranslation: 'esv',
				hiddenDashboardModules: ['board'],
				useCloudAI: true,
				useLocalAI: true,
				updatedAt: iso()
			},
			verseTranslations: VERSE_TRANSLATIONS,
			consentHistory: [{ decision: 'granted', recordedAt: iso() }]
		});
		const rows = await testDb()
			.select()
			.from(adConsentRecords)
			.where(eq(adConsentRecords.userId, user.id));
		expect(rows.map((row) => row.decision)).toEqual(['granted']);
	});

	it('writes no consent record when the ad setting does not change', async () => {
		const user = await seedUser(testDb());
		await seedCalendarSettings(user.id, { showAdsAsEvents: false });
		const res = await invoke(patchSettings, {
			ctx: testCtx({ db: testDb() }),
			user,
			path: '/api/me/settings',
			body: { showAdsAsEvents: false }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			settings: {
				id: 'settings-a',
				userId: user.id,
				weekStart: 'monday',
				timeZone: 'America/Chicago',
				color: '#112233',
				defaultView: 'dashboard',
				defaultCalendarId: null,
				syncEventsToFamilyCalendar: true,
				autoParseEventDetails: false,
				showDailyVerse: true,
				showAdsAsEvents: false,
				verseTranslation: 'esv',
				hiddenDashboardModules: ['board'],
				useCloudAI: true,
				useLocalAI: true,
				updatedAt: iso()
			},
			verseTranslations: VERSE_TRANSLATIONS,
			consentHistory: []
		});
		const rows = await testDb()
			.select()
			.from(adConsentRecords)
			.where(eq(adConsentRecords.userId, user.id));
		expect(rows).toEqual([]);
	});

	it('an empty object changes nothing and answers the stored row', async () => {
		const user = await seedUser(testDb());
		await seedCalendarSettings(user.id);
		const res = await invoke(patchSettings, {
			ctx: testCtx({ db: testDb() }),
			user,
			path: '/api/me/settings',
			body: {}
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			settings: {
				id: 'settings-a',
				userId: user.id,
				weekStart: 'monday',
				timeZone: 'America/Chicago',
				color: '#112233',
				defaultView: 'dashboard',
				defaultCalendarId: null,
				syncEventsToFamilyCalendar: true,
				autoParseEventDetails: false,
				showDailyVerse: true,
				showAdsAsEvents: false,
				verseTranslation: 'esv',
				hiddenDashboardModules: ['board'],
				useCloudAI: true,
				useLocalAI: true,
				updatedAt: iso()
			},
			verseTranslations: VERSE_TRANSLATIONS,
			consentHistory: []
		});
	});

	it.each<[Record<string, JsonValue>, string]>([
		[{ weekStart: 'friday' }, 'Invalid weekStart'],
		[{ timeZone: 'Mars/Base' }, 'Invalid timeZone'],
		[{ color: 'red' }, 'Invalid color'],
		[{ defaultView: 'yearView' }, 'Invalid defaultView'],
		[{ verseTranslation: 'xyz' }, 'Invalid verseTranslation'],
		[{ showAdsAsEvents: 'yes' }, 'Invalid showAdsAsEvents'],
		[{ syncEventsToFamilyCalendar: 1 }, 'Invalid syncEventsToFamilyCalendar'],
		[{ autoParseEventDetails: 'yes' }, 'Invalid autoParseEventDetails'],
		[{ showDailyVerse: 'yes' }, 'Invalid showDailyVerse'],
		[{ defaultCalendarId: 5 }, 'Invalid defaultCalendarId'],
		[{ hiddenDashboardModules: [] }, 'Unknown field: hiddenDashboardModules']
	])('answers 400 for %j', async (body, error) => {
		const user = await seedUser(testDb());
		await seedCalendarSettings(user.id);
		const res = await invoke(patchSettings, {
			ctx: testCtx({ db: testDb() }),
			user,
			path: '/api/me/settings',
			body
		});
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error });
		const after = await invoke(getSettings, {
			ctx: testCtx({ db: testDb() }),
			user,
			path: '/api/me/settings'
		});
		expect(after.body).toEqual({
			settings: {
				id: 'settings-a',
				userId: user.id,
				weekStart: 'monday',
				timeZone: 'America/Chicago',
				color: '#112233',
				defaultView: 'dashboard',
				defaultCalendarId: null,
				syncEventsToFamilyCalendar: true,
				autoParseEventDetails: false,
				showDailyVerse: true,
				showAdsAsEvents: false,
				verseTranslation: 'esv',
				hiddenDashboardModules: ['board'],
				useCloudAI: true,
				useLocalAI: true,
				updatedAt: iso()
			},
			verseTranslations: VERSE_TRANSLATIONS,
			consentHistory: []
		});
	});

	it('answers 400 {"error":"Invalid body"} when the body is not an object', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(patchSettings, {
			ctx: testCtx({ db: testDb() }),
			user,
			path: '/api/me/settings',
			body: [1]
		});
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'Invalid body' });
	});

	it('answers 400 {"error":"Invalid JSON"} for a malformed or an empty body', async () => {
		const user = await seedUser(testDb());
		const malformed = await invoke(patchSettings, {
			ctx: testCtx({ db: testDb() }),
			user,
			path: '/api/me/settings',
			rawBody: '{nope'
		});
		expect(malformed.status).toBe(400);
		expect(malformed.body).toEqual({ error: 'Invalid JSON' });
		const empty = await invoke(patchSettings, {
			ctx: testCtx({ db: testDb() }),
			user,
			path: '/api/me/settings',
			rawBody: ''
		});
		expect(empty.status).toBe(400);
		expect(empty.body).toEqual({ error: 'Invalid JSON' });
	});
});
