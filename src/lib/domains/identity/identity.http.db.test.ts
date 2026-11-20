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
import { goldenCtx } from '$lib/app/testing/goldenCtx.server';
import { testDb, truncateAll } from '$lib/kernel/testing/testDb.server';
import type { JsonValue } from '$lib/kernel/validation/validators';
import {
	IDENTITY_SEEDED_AT,
	seedIdentityApiToken,
	seedIdentityCalendar,
	seedIdentityConsent,
	seedIdentityFamily,
	seedIdentitySession,
	seedIdentitySettings,
	seedIdentitySparseSettings
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

/** ISO instant matcher: a freshly generated timestamp is asserted by shape only. */
const iso = () => expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

/**
 * `Array.isArray` narrows to `any[]`, which leaves `readonly JsonValue[]` in a
 * JSON union; this guard takes it out.
 */
function isJsonArray(value: JsonValue | null | undefined): value is readonly JsonValue[] {
	return Array.isArray(value);
}

/**
 * Narrow a JSON body without a cast: a wrong shape fails the test with the
 * value it read, which is what a golden should say when the wire moves.
 */
function jsonObject(value: JsonValue | null): { readonly [key: string]: JsonValue } {
	if (typeof value !== 'object' || value === null || isJsonArray(value)) {
		throw new Error(`expected a JSON object, got ${JSON.stringify(value)}`);
	}
	return value;
}

function jsonArray(value: JsonValue | null | undefined): readonly JsonValue[] {
	if (!Array.isArray(value)) throw new Error(`expected a JSON array, got ${JSON.stringify(value)}`);
	return value;
}

function textField(record: { readonly [key: string]: JsonValue }, key: string): string {
	const value = record[key];
	if (typeof value !== 'string') {
		throw new Error(`expected ${key} to be a string, got ${JSON.stringify(value)}`);
	}
	return value;
}

/** The 401 body every endpoint answers signed out. */
const unauthorized = { status: 401, body: { error: 'Unauthorized' } };

beforeEach(truncateAll);

describe('GET /api/me/api-tokens', () => {
	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const res = await invoke(listTokens, {
			ctx: goldenCtx({ db: testDb() }),
			path: '/api/me/api-tokens'
		});
		expect({ status: res.status, body: res.body }).toEqual(unauthorized);
	});

	it('lists your tokens with id, name, createdAt and lastUsedAt — never the hash', async () => {
		const user = await seedUser(testDb());
		await seedIdentityApiToken(user.id);
		const res = await invoke(listTokens, {
			ctx: goldenCtx({ db: testDb() }),
			user,
			path: '/api/me/api-tokens'
		});
		// `createdAt` is a plain timestamp and `lastUsedAt` a timestamptz, both
		// `mode:'date'`: a Date on the wire (apiTokens.ts:38-48).
		expect({ status: res.status, body: res.body }).toEqual({
			status: 200,
			body: {
				tokens: [
					{ id: 'tok-a', name: 'Phone', createdAt: IDENTITY_SEEDED_AT, lastUsedAt: null }
				]
			}
		});
	});

	it('lists every token you own; the list order is not part of the contract', async () => {
		const user = await seedUser(testDb());
		await seedIdentityApiToken(user.id, {
			id: 'tok-a',
			name: 'Phone',
			createdAt: new Date('2026-10-05T08:00:00.000Z')
		});
		await seedIdentityApiToken(user.id, {
			id: 'tok-b',
			name: 'Tablet',
			tokenHash: 'other-seed-hash',
			createdAt: new Date('2026-10-06T08:00:00.000Z'),
			lastUsedAt: new Date('2026-10-08T09:30:00.000Z')
		});
		const res = await invoke(listTokens, {
			ctx: goldenCtx({ db: testDb() }),
			user,
			path: '/api/me/api-tokens'
		});
		expect(res.status).toBe(200);
		// Q-110: `listTokensForUser` has no ORDER BY, so the contract is the set.
		const tokens = [...jsonArray(jsonObject(res.body).tokens)].sort((a, b) =>
			textField(jsonObject(a), 'id').localeCompare(textField(jsonObject(b), 'id'))
		);
		expect(tokens).toEqual([
			{ id: 'tok-a', name: 'Phone', createdAt: '2026-10-05T08:00:00.000Z', lastUsedAt: null },
			{
				id: 'tok-b',
				name: 'Tablet',
				createdAt: '2026-10-06T08:00:00.000Z',
				lastUsedAt: '2026-10-08T09:30:00.000Z'
			}
		]);
	});

	it('never returns another person’s tokens', async () => {
		const user = await seedUser(testDb());
		const other = await seedUser(testDb());
		await seedIdentityApiToken(other.id, { id: 'tok-b', name: 'Their phone' });
		const res = await invoke(listTokens, {
			ctx: goldenCtx({ db: testDb() }),
			user,
			path: '/api/me/api-tokens'
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 200,
			body: { tokens: [] }
		});
	});
});

describe('POST /api/me/api-tokens', () => {
	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const res = await invoke(createToken, {
			ctx: goldenCtx({ db: testDb() }),
			path: '/api/me/api-tokens',
			body: { name: 'Phone' }
		});
		expect({ status: res.status, body: res.body }).toEqual(unauthorized);
	});

	it('mints an fp_ token, answers 201 with the plaintext once and stores only its SHA-256', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(createToken, {
			ctx: goldenCtx({ db: testDb() }),
			user,
			path: '/api/me/api-tokens',
			body: { name: '  My phone  ' }
		});
		expect(res.status).toBe(201);
		expect(res.body).toEqual({
			token: expect.stringMatching(/^fp_[A-Za-z0-9_-]{43}$/),
			record: { id: expect.any(String), name: 'My phone', createdAt: iso() }
		});
		const body = jsonObject(res.body);
		const record = jsonObject(body.record);
		const plaintext = textField(body, 'token');
		const rows = await testDb().select().from(apiTokens).where(eq(apiTokens.userId, user.id));
		expect(rows).toHaveLength(1);
		expect(rows[0].id).toBe(textField(record, 'id'));
		expect(rows[0].name).toBe('My phone');
		expect(rows[0].tokenHash).toBe(createHash('sha256').update(plaintext).digest('hex'));
		expect(rows[0].tokenHash).not.toContain(plaintext);
		expect(rows[0].lastUsedAt).toBeNull();
	});

	it('keeps at most 60 characters of the name', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(createToken, {
			ctx: goldenCtx({ db: testDb() }),
			user,
			path: '/api/me/api-tokens',
			body: { name: 'x'.repeat(70) }
		});
		expect(res.status).toBe(201);
		const name = textField(jsonObject(jsonObject(res.body).record), 'name');
		expect(name).toBe('x'.repeat(60));
		const rows = await testDb().select().from(apiTokens).where(eq(apiTokens.userId, user.id));
		expect(rows[0].name).toBe('x'.repeat(60));
	});

	// Q-109 (decided B for after S6): the cut is on UTF-16 code units
	// (`name.trim().slice(0, 60)`, accountData.ts:431), so an emoji straddling
	// unit 60 is split and Postgres stores its lone half as U+FFFD.
	it('cuts the name at 60 UTF-16 units, splitting an emoji on the boundary', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(createToken, {
			ctx: goldenCtx({ db: testDb() }),
			user,
			path: '/api/me/api-tokens',
			body: { name: `${'a'.repeat(59)}😀tail` }
		});
		expect(res.status).toBe(201);
		const name = textField(jsonObject(jsonObject(res.body).record), 'name');
		expect(name).toHaveLength(60);
		expect(name).toBe(`${'a'.repeat(59)}\uFFFD`);
		const rows = await testDb().select().from(apiTokens).where(eq(apiTokens.userId, user.id));
		expect(rows[0].name).toBe(`${'a'.repeat(59)}\uFFFD`);
	});

	it('keeps whitespace that sits before the cut (only the ends are trimmed)', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(createToken, {
			ctx: goldenCtx({ db: testDb() }),
			user,
			path: '/api/me/api-tokens',
			body: { name: `${'w'.repeat(58)}   more` }
		});
		expect(res.status).toBe(201);
		const name = textField(jsonObject(jsonObject(res.body).record), 'name');
		expect(name).toBe(`${'w'.repeat(58)}  `);
		const rows = await testDb().select().from(apiTokens).where(eq(apiTokens.userId, user.id));
		expect(rows[0].name).toBe(`${'w'.repeat(58)}  `);
	});

	it('refuses an absent name with the legacy message (an empty body reads as {})', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(createToken, {
			ctx: goldenCtx({ db: testDb() }),
			user,
			path: '/api/me/api-tokens',
			rawBody: ''
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 400,
			body: { error: 'Token name is required' }
		});
	});

	it('refuses a whitespace-only name with the legacy message', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(createToken, {
			ctx: goldenCtx({ db: testDb() }),
			user,
			path: '/api/me/api-tokens',
			body: { name: '   ' }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 400,
			body: { error: 'Token name is required' }
		});
	});

	it('refuses a non-string name with the legacy message', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(createToken, {
			ctx: goldenCtx({ db: testDb() }),
			user,
			path: '/api/me/api-tokens',
			body: { name: 42 }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 400,
			body: { error: 'Token name is required' }
		});
	});

	it('answers 400 {"error":"Invalid JSON"} for a malformed body', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(createToken, {
			ctx: goldenCtx({ db: testDb() }),
			user,
			path: '/api/me/api-tokens',
			rawBody: '{nope'
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 400,
			body: { error: 'Invalid JSON' }
		});
	});

	it('answers 400 {"error":"Invalid JSON"} for a JSON array (not an object)', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(createToken, {
			ctx: goldenCtx({ db: testDb() }),
			user,
			path: '/api/me/api-tokens',
			body: [1]
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 400,
			body: { error: 'Invalid JSON' }
		});
	});

	it('answers 400 {"error":"Invalid JSON"} for a JSON null or a JSON string body', async () => {
		const user = await seedUser(testDb());
		const nul = await invoke(createToken, {
			ctx: goldenCtx({ db: testDb() }),
			user,
			path: '/api/me/api-tokens',
			body: null
		});
		expect({ status: nul.status, body: nul.body }).toEqual({
			status: 400,
			body: { error: 'Invalid JSON' }
		});
		const text = await invoke(createToken, {
			ctx: goldenCtx({ db: testDb() }),
			user,
			path: '/api/me/api-tokens',
			body: 'nope'
		});
		expect({ status: text.status, body: text.body }).toEqual({
			status: 400,
			body: { error: 'Invalid JSON' }
		});
		const rows = await testDb().select().from(apiTokens).where(eq(apiTokens.userId, user.id));
		expect(rows).toEqual([]);
	});
});

describe('DELETE /api/me/api-tokens/:id', () => {
	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const res = await invoke(revokeToken, {
			ctx: goldenCtx({ db: testDb() }),
			path: '/api/me/api-tokens/tok-a',
			params: { id: 'tok-a' }
		});
		expect({ status: res.status, body: res.body }).toEqual(unauthorized);
	});

	it('revokes your own token and answers {success:true}', async () => {
		const user = await seedUser(testDb());
		await seedIdentityApiToken(user.id);
		const res = await invoke(revokeToken, {
			ctx: goldenCtx({ db: testDb() }),
			user,
			path: '/api/me/api-tokens/tok-a',
			params: { id: 'tok-a' }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 200,
			body: { success: true }
		});
		const rows = await testDb().select().from(apiTokens).where(eq(apiTokens.userId, user.id));
		expect(rows).toEqual([]);
	});

	it('is owner-scoped: another person’s id deletes nothing and still answers {success:true}', async () => {
		const user = await seedUser(testDb());
		const other = await seedUser(testDb());
		await seedIdentityApiToken(other.id, { id: 'tok-b', name: 'Their phone' });
		const res = await invoke(revokeToken, {
			ctx: goldenCtx({ db: testDb() }),
			user,
			path: '/api/me/api-tokens/tok-b',
			params: { id: 'tok-b' }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 200,
			body: { success: true }
		});
		const rows = await testDb().select().from(apiTokens).where(eq(apiTokens.id, 'tok-b'));
		expect(rows).toHaveLength(1);
	});

	it('an unknown id is the same 200, so ids cannot be probed', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(revokeToken, {
			ctx: goldenCtx({ db: testDb() }),
			user,
			path: '/api/me/api-tokens/nope',
			params: { id: 'nope' }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 200,
			body: { success: true }
		});
	});

	it('answers 400 {"error":"Token id is required"} for an empty id', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(revokeToken, {
			ctx: goldenCtx({ db: testDb() }),
			user,
			path: '/api/me/api-tokens/',
			params: { id: '' }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 400,
			body: { error: 'Token id is required' }
		});
	});
});

describe('PATCH /api/me/profile', () => {
	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const res = await invoke(patchProfile, {
			ctx: goldenCtx({ db: testDb() }),
			path: '/api/me/profile',
			body: { firstName: 'Mia', lastName: 'Lopez' }
		});
		expect({ status: res.status, body: res.body }).toEqual(unauthorized);
	});

	it('trims both names, writes them and echoes them with the email', async () => {
		const user = await seedUser(testDb(), { firstName: 'Old', lastName: 'Name' });
		const res = await invoke(patchProfile, {
			ctx: goldenCtx({ db: testDb() }),
			user,
			path: '/api/me/profile',
			body: { firstName: '  Mia  ', lastName: '  Lopez  ' }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 200,
			body: {
				success: true,
				user: { id: user.id, firstName: 'Mia', lastName: 'Lopez', email: user.email }
			}
		});
		const [row] = await testDb().select().from(users).where(eq(users.id, user.id));
		expect([row.firstName, row.lastName]).toEqual(['Mia', 'Lopez']);
	});

	it('masks an Anonymous Account’s placeholder email to null', async () => {
		const guest = await seedUser(testDb(), {
			email: 'guest@anonymous.placeholder.invalid'
		});
		const res = await invoke(patchProfile, {
			ctx: goldenCtx({ db: testDb() }),
			user: guest,
			path: '/api/me/profile',
			body: { firstName: 'Guest', lastName: 'Person' }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 200,
			body: {
				success: true,
				user: { id: guest.id, firstName: 'Guest', lastName: 'Person', email: null }
			}
		});
	});

	it('refuses an absent last name with the legacy message', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(patchProfile, {
			ctx: goldenCtx({ db: testDb() }),
			user,
			path: '/api/me/profile',
			body: { firstName: 'Mia' }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 400,
			body: { error: 'First name and last name are required' }
		});
	});

	it('refuses a non-string name and writes nothing', async () => {
		const user = await seedUser(testDb(), { firstName: 'Unchanged', lastName: 'Person' });
		const res = await invoke(patchProfile, {
			ctx: goldenCtx({ db: testDb() }),
			user,
			path: '/api/me/profile',
			body: { firstName: 5, lastName: 'Lopez' }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 400,
			body: { error: 'First name and last name are required' }
		});
		const [row] = await testDb().select().from(users).where(eq(users.id, user.id));
		expect([row.firstName, row.lastName]).toEqual(['Unchanged', 'Person']);
	});

	it('refuses a spaces-only name and an empty body, writing nothing', async () => {
		const user = await seedUser(testDb(), { firstName: 'Unchanged', lastName: 'Person' });
		const blank = await invoke(patchProfile, {
			ctx: goldenCtx({ db: testDb() }),
			user,
			path: '/api/me/profile',
			body: { firstName: '   ', lastName: 'Lopez' }
		});
		expect({ status: blank.status, body: blank.body }).toEqual({
			status: 400,
			body: { error: 'First name and last name are required' }
		});
		const empty = await invoke(patchProfile, {
			ctx: goldenCtx({ db: testDb() }),
			user,
			path: '/api/me/profile',
			rawBody: ''
		});
		expect({ status: empty.status, body: empty.body }).toEqual({
			status: 400,
			body: { error: 'First name and last name are required' }
		});
		const [row] = await testDb().select().from(users).where(eq(users.id, user.id));
		expect([row.firstName, row.lastName]).toEqual(['Unchanged', 'Person']);
	});

	it('answers 400 {"error":"Invalid JSON"} for a malformed body', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(patchProfile, {
			ctx: goldenCtx({ db: testDb() }),
			user,
			path: '/api/me/profile',
			rawBody: '{nope'
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 400,
			body: { error: 'Invalid JSON' }
		});
	});

	it('answers 400 {"error":"Invalid JSON"} for a JSON null or a JSON string body', async () => {
		const user = await seedUser(testDb());
		const nul = await invoke(patchProfile, {
			ctx: goldenCtx({ db: testDb() }),
			user,
			path: '/api/me/profile',
			body: null
		});
		expect({ status: nul.status, body: nul.body }).toEqual({
			status: 400,
			body: { error: 'Invalid JSON' }
		});
		const text = await invoke(patchProfile, {
			ctx: goldenCtx({ db: testDb() }),
			user,
			path: '/api/me/profile',
			body: 'nope'
		});
		expect({ status: text.status, body: text.body }).toEqual({
			status: 400,
			body: { error: 'Invalid JSON' }
		});
	});
});

describe('POST /api/me/sessions/revoke-others', () => {
	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const res = await invoke(revokeOtherSessions, {
			ctx: goldenCtx({ db: testDb() }),
			path: '/api/me/sessions/revoke-others'
		});
		expect({ status: res.status, body: res.body }).toEqual(unauthorized);
	});

	it('revokes every web session of the caller, leaves other people and API tokens alone', async () => {
		const user = await seedUser(testDb());
		const other = await seedUser(testDb());
		await seedIdentitySession(user.id, 'sess-a');
		await seedIdentitySession(user.id, 'sess-b');
		await seedIdentitySession(other.id, 'sess-other');
		await seedIdentityApiToken(user.id, { id: 'tok-a' });
		await seedIdentityApiToken(other.id, { id: 'tok-b', tokenHash: 'other-token-hash' });

		const res = await invoke(revokeOtherSessions, {
			ctx: goldenCtx({ db: testDb() }),
			user,
			path: '/api/me/sessions/revoke-others'
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 200,
			body: { success: true, revoked: 2 }
		});

		const sessions = await testDb().select().from(authSession);
		expect(sessions.map((row) => row.id)).toEqual(['sess-other']);
		const tokens = await testDb().select().from(apiTokens);
		expect(tokens.map((row) => row.id).sort()).toEqual(['tok-a', 'tok-b']);
	});

	it('a Bearer caller (no cookie session) signs out every web session too', async () => {
		const user = await seedUser(testDb());
		await seedIdentitySession(user.id, 'sess-a');
		const res = await invoke(revokeOtherSessions, {
			ctx: goldenCtx({ db: testDb() }),
			user,
			via: 'token',
			path: '/api/me/sessions/revoke-others'
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 200,
			body: { success: true, revoked: 1 }
		});
		const sessions = await testDb().select().from(authSession).where(eq(authSession.userId, user.id));
		expect(sessions).toEqual([]);
	});
});

describe('GET /api/me/settings', () => {
	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const res = await invoke(getSettings, {
			ctx: goldenCtx({ db: testDb() }),
			path: '/api/me/settings'
		});
		expect({ status: res.status, body: res.body }).toEqual(unauthorized);
	});

	it('answers the page defaults when the person has no settings row', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(getSettings, {
			ctx: goldenCtx({ db: testDb() }),
			user,
			path: '/api/me/settings'
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 200,
			body: {
				settings: {
					weekStart: 'sunday',
					timeZone: 'UTC',
					color: '#3b82f6',
					defaultView: 'dayView',
					defaultCalendarId: null,
					syncEventsToFamilyCalendar: false,
					showAdsAsEvents: false
				},
				consentHistory: []
			}
		});
	});

	it('answers the stored row and the consent trail, newest first', async () => {
		const user = await seedUser(testDb());
		await seedIdentityCalendar(user.id, 'cal-mine');
		await seedIdentitySettings(user.id, { defaultCalendarId: 'cal-mine', useCloudAI: false });
		// Two rows at explicit instants: the trail is read `recordedAt DESC`
		// (adConsentService.ts:58-64), so order is observable, not incidental.
		await seedIdentityConsent(user.id, 'granted', '2026-10-01T10:00:00.000Z');
		await seedIdentityConsent(user.id, 'withdrawn', '2026-10-03T18:30:00.000Z');
		const res = await invoke(getSettings, {
			ctx: goldenCtx({ db: testDb() }),
			user,
			path: '/api/me/settings'
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 200,
			body: {
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
					hiddenDashboardModules: ['board'],
					useCloudAI: false,
					useLocalAI: true,
					updatedAt: IDENTITY_SEEDED_AT
				},
				consentHistory: [
					{ decision: 'withdrawn', recordedAt: '2026-10-03T18:30:00.000Z' },
					{ decision: 'granted', recordedAt: '2026-10-01T10:00:00.000Z' }
				]
			}
		});
	});
});

describe('PATCH /api/me/settings', () => {
	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const res = await invoke(patchSettings, {
			ctx: goldenCtx({ db: testDb() }),
			path: '/api/me/settings',
			body: { timeZone: 'UTC' }
		});
		expect({ status: res.status, body: res.body }).toEqual(unauthorized);
	});

	it('timeZone alone keeps every other stored field (and skips the stale default-calendar check)', async () => {
		const user = await seedUser(testDb());
		const other = await seedUser(testDb());
		// Owned by another person, in no family of the caller: a real but
		// inaccessible default calendar — the stale id this test must keep.
		await seedIdentityCalendar(other.id, 'cal-their-calendar');
		await seedIdentitySettings(user.id, { defaultCalendarId: 'cal-their-calendar' });
		const res = await invoke(patchSettings, {
			ctx: goldenCtx({ db: testDb() }),
			user,
			path: '/api/me/settings',
			body: { timeZone: 'Asia/Tokyo' }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 200,
			body: {
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
					hiddenDashboardModules: ['board'],
					useCloudAI: true,
					useLocalAI: true,
					updatedAt: iso()
				},
				consentHistory: []
			}
		});
		const [row] = await testDb().select().from(userSettings).where(eq(userSettings.userId, user.id));
		expect(row.timeZone).toBe('Asia/Tokyo');
		expect(row.defaultCalendarId).toBe('cal-their-calendar');
	});

	it('creates the row from the page defaults plus the patch when none exists', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(patchSettings, {
			ctx: goldenCtx({ db: testDb() }),
			user,
			path: '/api/me/settings',
			body: { defaultView: 'monthView' }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 200,
			body: {
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
					hiddenDashboardModules: null,
					useCloudAI: true,
					useLocalAI: true,
					updatedAt: iso()
				},
				consentHistory: []
			}
		});
		const rows = await testDb().select().from(userSettings).where(eq(userSettings.userId, user.id));
		expect(rows).toHaveLength(1);
	});

	// Q-108 (decided B for after S6): a sign-up row is `{userId, timeZone:'UTC'}`
	// only (users.ts:138, mobileAuth.ts:327), so GET answers nulls while a
	// no-row caller gets the defaults, and the first PATCH backfills both nulls
	// from ACCOUNT_SETTINGS_DEFAULTS (settings/+server.ts:102-115).
	it('a sparse sign-up row answers nulls, then the first PATCH fills them from the defaults', async () => {
		const user = await seedUser(testDb());
		await seedIdentitySparseSettings(user.id);
		const before = await invoke(getSettings, {
			ctx: goldenCtx({ db: testDb() }),
			user,
			path: '/api/me/settings'
		});
		expect({ status: before.status, body: before.body }).toEqual({
			status: 200,
			body: {
				settings: {
					id: expect.any(String),
					userId: user.id,
					weekStart: 'sunday',
					timeZone: 'UTC',
					color: null,
					defaultView: 'dayView',
					defaultCalendarId: null,
					syncEventsToFamilyCalendar: null,
					autoParseEventDetails: true,
					showDailyVerse: false,
					showAdsAsEvents: false,
					hiddenDashboardModules: null,
					useCloudAI: true,
					useLocalAI: true,
					updatedAt: IDENTITY_SEEDED_AT
				},
				consentHistory: []
			}
		});

		const after = await invoke(patchSettings, {
			ctx: goldenCtx({ db: testDb() }),
			user,
			path: '/api/me/settings',
			body: { timeZone: 'America/Denver' }
		});
		expect({ status: after.status, body: after.body }).toEqual({
			status: 200,
			body: {
				settings: {
					id: expect.any(String),
					userId: user.id,
					weekStart: 'sunday',
					timeZone: 'America/Denver',
					color: '#3b82f6',
					defaultView: 'dayView',
					defaultCalendarId: null,
					syncEventsToFamilyCalendar: false,
					autoParseEventDetails: true,
					showDailyVerse: false,
					showAdsAsEvents: false,
					hiddenDashboardModules: null,
					useCloudAI: true,
					useLocalAI: true,
					updatedAt: iso()
				},
				consentHistory: []
			}
		});
		const [row] = await testDb().select().from(userSettings).where(eq(userSettings.userId, user.id));
		expect([row.color, row.syncEventsToFamilyCalendar]).toEqual(['#3b82f6', false]);
	});

	it('accepts a new default calendar the caller owns and stores it', async () => {
		const user = await seedUser(testDb());
		await seedIdentityCalendar(user.id, 'cal-mine');
		await seedIdentityCalendar(user.id, 'cal-mine-two');
		await seedIdentitySettings(user.id, { defaultCalendarId: 'cal-mine' });
		const res = await invoke(patchSettings, {
			ctx: goldenCtx({ db: testDb() }),
			user,
			path: '/api/me/settings',
			body: { defaultCalendarId: 'cal-mine-two' }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 200,
			body: {
				settings: {
					id: 'settings-a',
					userId: user.id,
					weekStart: 'monday',
					timeZone: 'America/Chicago',
					color: '#112233',
					defaultView: 'dashboard',
					defaultCalendarId: 'cal-mine-two',
					syncEventsToFamilyCalendar: true,
					autoParseEventDetails: false,
					showDailyVerse: true,
					showAdsAsEvents: false,
					hiddenDashboardModules: ['board'],
					useCloudAI: true,
					useLocalAI: true,
					updatedAt: iso()
				},
				consentHistory: []
			}
		});
		const [row] = await testDb().select().from(userSettings).where(eq(userSettings.userId, user.id));
		expect(row.defaultCalendarId).toBe('cal-mine-two');
	});

	it('accepts a family calendar the caller is a member of', async () => {
		const user = await seedUser(testDb());
		await seedIdentityFamily(user.id, 'fam-home');
		await seedIdentityCalendar(null, 'cal-family', { familyId: 'fam-home' });
		await seedIdentitySettings(user.id);
		const res = await invoke(patchSettings, {
			ctx: goldenCtx({ db: testDb() }),
			user,
			path: '/api/me/settings',
			body: { defaultCalendarId: 'cal-family' }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 200,
			body: {
				settings: {
					id: 'settings-a',
					userId: user.id,
					weekStart: 'monday',
					timeZone: 'America/Chicago',
					color: '#112233',
					defaultView: 'dashboard',
					defaultCalendarId: 'cal-family',
					syncEventsToFamilyCalendar: true,
					autoParseEventDetails: false,
					showDailyVerse: true,
					showAdsAsEvents: false,
					hiddenDashboardModules: ['board'],
					useCloudAI: true,
					useLocalAI: true,
					updatedAt: iso()
				},
				consentHistory: []
			}
		});
		const [row] = await testDb().select().from(userSettings).where(eq(userSettings.userId, user.id));
		expect(row.defaultCalendarId).toBe('cal-family');
	});

	it('accepts defaultCalendarId:null and stores null', async () => {
		const user = await seedUser(testDb());
		await seedIdentityCalendar(user.id, 'cal-mine');
		await seedIdentitySettings(user.id, { defaultCalendarId: 'cal-mine' });
		const res = await invoke(patchSettings, {
			ctx: goldenCtx({ db: testDb() }),
			user,
			path: '/api/me/settings',
			body: { defaultCalendarId: null }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 200,
			body: {
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
					hiddenDashboardModules: ['board'],
					useCloudAI: true,
					useLocalAI: true,
					updatedAt: iso()
				},
				consentHistory: []
			}
		});
		const [row] = await testDb().select().from(userSettings).where(eq(userSettings.userId, user.id));
		expect(row.defaultCalendarId).toBeNull();
	});

	it('treats an empty defaultCalendarId as null', async () => {
		const user = await seedUser(testDb());
		await seedIdentityCalendar(user.id, 'cal-mine');
		await seedIdentitySettings(user.id, { defaultCalendarId: 'cal-mine' });
		const res = await invoke(patchSettings, {
			ctx: goldenCtx({ db: testDb() }),
			user,
			path: '/api/me/settings',
			body: { defaultCalendarId: '' }
		});
		// `patch.defaultCalendarId = b.defaultCalendarId || null` (settings/+server.ts:71).
		expect({ status: res.status, body: res.body }).toEqual({
			status: 200,
			body: {
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
					hiddenDashboardModules: ['board'],
					useCloudAI: true,
					useLocalAI: true,
					updatedAt: iso()
				},
				consentHistory: []
			}
		});
		const [row] = await testDb().select().from(userSettings).where(eq(userSettings.userId, user.id));
		expect(row.defaultCalendarId).toBeNull();
	});

	it('keeps the stored row when a newly set default calendar is not accessible', async () => {
		const user = await seedUser(testDb());
		const other = await seedUser(testDb());
		await seedIdentityCalendar(user.id, 'cal-mine');
		await seedIdentityCalendar(other.id, 'cal-their-calendar');
		await seedIdentitySettings(user.id, { defaultCalendarId: 'cal-mine' });
		const res = await invoke(patchSettings, {
			ctx: goldenCtx({ db: testDb() }),
			user,
			path: '/api/me/settings',
			body: { defaultCalendarId: 'cal-their-calendar' }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 400,
			body: { error: 'Selected default calendar is not available' }
		});
		const [row] = await testDb().select().from(userSettings).where(eq(userSettings.userId, user.id));
		expect(row.defaultCalendarId).toBe('cal-mine');
	});

	it('writes showDailyVerse, weekStart, color, sync and autoParse in one PATCH, and answers the stored row', async () => {
		const user = await seedUser(testDb());
		await seedIdentitySettings(user.id, { showDailyVerse: true });
		const res = await invoke(patchSettings, {
			ctx: goldenCtx({ db: testDb() }),
			user,
			path: '/api/me/settings',
			body: {
				weekStart: 'sunday',
				color: '#00ff00',
				syncEventsToFamilyCalendar: false,
				autoParseEventDetails: true,
				showDailyVerse: false
			}
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 200,
			body: {
				settings: {
					id: 'settings-a',
					userId: user.id,
					weekStart: 'sunday',
					timeZone: 'America/Chicago',
					color: '#00ff00',
					defaultView: 'dashboard',
					defaultCalendarId: null,
					syncEventsToFamilyCalendar: false,
					autoParseEventDetails: true,
					showDailyVerse: false,
					showAdsAsEvents: false,
					hiddenDashboardModules: ['board'],
					useCloudAI: true,
					useLocalAI: true,
					updatedAt: iso()
				},
				consentHistory: []
			}
		});
		const [row] = await testDb().select().from(userSettings).where(eq(userSettings.userId, user.id));
		expect([
			row.showDailyVerse,
			row.weekStart,
			row.color,
			row.syncEventsToFamilyCalendar,
			row.autoParseEventDetails
		]).toEqual([false, 'sunday', '#00ff00', false, true]);
	});

	it('records the ad-consent transition when showAdsAsEvents turns on', async () => {
		const user = await seedUser(testDb());
		await seedIdentitySettings(user.id, { showAdsAsEvents: false });
		const res = await invoke(patchSettings, {
			ctx: goldenCtx({ db: testDb() }),
			user,
			path: '/api/me/settings',
			body: { showAdsAsEvents: true }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 200,
			body: {
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
					hiddenDashboardModules: ['board'],
					useCloudAI: true,
					useLocalAI: true,
					updatedAt: iso()
				},
				consentHistory: [{ decision: 'granted', recordedAt: iso() }]
			}
		});
		const rows = await testDb()
			.select()
			.from(adConsentRecords)
			.where(eq(adConsentRecords.userId, user.id));
		expect(rows.map((row) => row.decision)).toEqual(['granted']);
	});

	it('records a withdrawn consent when showAdsAsEvents turns off', async () => {
		const user = await seedUser(testDb());
		await seedIdentitySettings(user.id, { showAdsAsEvents: true });
		const res = await invoke(patchSettings, {
			ctx: goldenCtx({ db: testDb() }),
			user,
			path: '/api/me/settings',
			body: { showAdsAsEvents: false }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 200,
			body: {
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
					hiddenDashboardModules: ['board'],
					useCloudAI: true,
					useLocalAI: true,
					updatedAt: iso()
				},
				consentHistory: [{ decision: 'withdrawn', recordedAt: iso() }]
			}
		});
		const rows = await testDb()
			.select()
			.from(adConsentRecords)
			.where(eq(adConsentRecords.userId, user.id));
		expect(rows.map((row) => row.decision)).toEqual(['withdrawn']);
	});

	it('writes no consent record when the ad setting does not change', async () => {
		const user = await seedUser(testDb());
		await seedIdentitySettings(user.id, { showAdsAsEvents: false });
		const res = await invoke(patchSettings, {
			ctx: goldenCtx({ db: testDb() }),
			user,
			path: '/api/me/settings',
			body: { showAdsAsEvents: false }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 200,
			body: {
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
					hiddenDashboardModules: ['board'],
					useCloudAI: true,
					useLocalAI: true,
					updatedAt: iso()
				},
				consentHistory: []
			}
		});
		const rows = await testDb()
			.select()
			.from(adConsentRecords)
			.where(eq(adConsentRecords.userId, user.id));
		expect(rows).toEqual([]);
	});

	it('an empty object changes nothing and answers the stored row', async () => {
		const user = await seedUser(testDb());
		await seedIdentitySettings(user.id);
		const res = await invoke(patchSettings, {
			ctx: goldenCtx({ db: testDb() }),
			user,
			path: '/api/me/settings',
			body: {}
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 200,
			body: {
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
					hiddenDashboardModules: ['board'],
					useCloudAI: true,
					useLocalAI: true,
					updatedAt: iso()
				},
				consentHistory: []
			}
		});
	});

	// Q-107 (decided B for after S6): validation is Luxon `setZone().isValid`
	// (settings/+server.ts:53-57), so pseudo-zones pass and are stored verbatim.
	it.each<[string, string]>([
		['local', 'local'],
		['UTC+5', 'UTC+5']
	])('accepts the Luxon-valid zone %s and stores it as sent', async (sent, stored) => {
		const user = await seedUser(testDb());
		await seedIdentitySettings(user.id);
		const res = await invoke(patchSettings, {
			ctx: goldenCtx({ db: testDb() }),
			user,
			path: '/api/me/settings',
			body: { timeZone: sent }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 200,
			body: {
				settings: {
					id: 'settings-a',
					userId: user.id,
					weekStart: 'monday',
					timeZone: stored,
					color: '#112233',
					defaultView: 'dashboard',
					defaultCalendarId: null,
					syncEventsToFamilyCalendar: true,
					autoParseEventDetails: false,
					showDailyVerse: true,
					showAdsAsEvents: false,
					hiddenDashboardModules: ['board'],
					useCloudAI: true,
					useLocalAI: true,
					updatedAt: iso()
				},
				consentHistory: []
			}
		});
		const [row] = await testDb().select().from(userSettings).where(eq(userSettings.userId, user.id));
		expect(row.timeZone).toBe(stored);
	});

	it.each<[Record<string, JsonValue>, string]>([
		[{ weekStart: 'friday' }, 'Invalid weekStart'],
		[{ timeZone: 'Mars/Base' }, 'Invalid timeZone'],
		[{ timeZone: '' }, 'Invalid timeZone'],
		[{ color: 'red' }, 'Invalid color'],
		[{ defaultView: 'yearView' }, 'Invalid defaultView'],
		[{ verseTranslation: 'esv' }, 'Unknown field: verseTranslation'],
		[{ useCloudAI: false }, 'Unknown field: useCloudAI'],
		[{ useLocalAI: false }, 'Unknown field: useLocalAI'],
		[{ showAdsAsEvents: 'yes' }, 'Invalid showAdsAsEvents'],
		[{ syncEventsToFamilyCalendar: 1 }, 'Invalid syncEventsToFamilyCalendar'],
		[{ autoParseEventDetails: 'yes' }, 'Invalid autoParseEventDetails'],
		[{ showDailyVerse: 'yes' }, 'Invalid showDailyVerse'],
		[{ defaultCalendarId: 5 }, 'Invalid defaultCalendarId'],
		[{ hiddenDashboardModules: [] }, 'Unknown field: hiddenDashboardModules'],
		// The unknown-key sweep runs first (settings/+server.ts:44-46) ...
		[{ weekStart: 'friday', bogus: 1 }, 'Unknown field: bogus'],
		// ... and a known key's check order is the code's, not the body's (:48-78).
		[{ timeZone: 'Mars/Base', weekStart: 'friday' }, 'Invalid weekStart']
	])('answers 400 for %j', async (body, error) => {
		const user = await seedUser(testDb());
		await seedIdentitySettings(user.id);
		const res = await invoke(patchSettings, {
			ctx: goldenCtx({ db: testDb() }),
			user,
			path: '/api/me/settings',
			body
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 400,
			body: { error }
		});
		const after = await invoke(getSettings, {
			ctx: goldenCtx({ db: testDb() }),
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
				hiddenDashboardModules: ['board'],
				useCloudAI: true,
				useLocalAI: true,
				updatedAt: IDENTITY_SEEDED_AT
			},
			consentHistory: []
		});
	});

	it('answers 400 {"error":"Invalid body"} when the body is not an object', async () => {
		const user = await seedUser(testDb());
		const array = await invoke(patchSettings, {
			ctx: goldenCtx({ db: testDb() }),
			user,
			path: '/api/me/settings',
			body: [1]
		});
		expect({ status: array.status, body: array.body }).toEqual({
			status: 400,
			body: { error: 'Invalid body' }
		});
		const nul = await invoke(patchSettings, {
			ctx: goldenCtx({ db: testDb() }),
			user,
			path: '/api/me/settings',
			body: null
		});
		expect({ status: nul.status, body: nul.body }).toEqual({
			status: 400,
			body: { error: 'Invalid body' }
		});
		const text = await invoke(patchSettings, {
			ctx: goldenCtx({ db: testDb() }),
			user,
			path: '/api/me/settings',
			body: 'nope'
		});
		expect({ status: text.status, body: text.body }).toEqual({
			status: 400,
			body: { error: 'Invalid body' }
		});
	});

	it('answers 400 {"error":"Invalid JSON"} for a malformed or an empty body', async () => {
		const user = await seedUser(testDb());
		const malformed = await invoke(patchSettings, {
			ctx: goldenCtx({ db: testDb() }),
			user,
			path: '/api/me/settings',
			rawBody: '{nope'
		});
		expect({ status: malformed.status, body: malformed.body }).toEqual({
			status: 400,
			body: { error: 'Invalid JSON' }
		});
		const empty = await invoke(patchSettings, {
			ctx: goldenCtx({ db: testDb() }),
			user,
			path: '/api/me/settings',
			rawBody: ''
		});
		expect({ status: empty.status, body: empty.body }).toEqual({
			status: 400,
			body: { error: 'Invalid JSON' }
		});
	});
});
