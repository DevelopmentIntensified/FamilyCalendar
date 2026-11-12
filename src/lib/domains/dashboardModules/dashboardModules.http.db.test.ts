/**
 * Golden contract tests for dashboardModules' two `/api` routes, pinned
 * against today's legacy handlers (S2). They must stay green, unchanged,
 * after the port (docs/rewrite/playbooks/characterize-endpoints.md).
 * Doc: ./README.md#how-to-test
 */
import { count, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
	dashboardModuleSwitches,
	families,
	familyMembers,
	userSettings
} from '$lib/kernel/db/tables.server';
import { invoke } from '$lib/kernel/testing/invokeHandlers.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { testDb, truncateAll } from '$lib/kernel/testing/testDb.server';
// Import the ROUTE modules, not the legacy services: the route is what clients
// hit, and after the port it re-exports the new handler, so this import stays.
import { PUT as putFamilyModuleSwitch } from '../../../routes/api/families/[id]/modules/[module]/+server';
import { PUT as putMyDashboardModules } from '../../../routes/api/me/dashboard-modules/+server';

const ctx = () => testCtx({ db: testDb() });

type FamilyRole = 'creator' | 'admin' | 'member' | null;

/** A person, a family, and (unless role is null) their membership in it. */
async function seedFamily(role: FamilyRole) {
	const user = await seedUser(testDb());
	const [family] = await testDb().insert(families).values({ name: 'Test family' }).returning();
	if (role) {
		await testDb().insert(familyMembers).values({ userId: user.id, familyId: family.id, role });
	}
	return { user, family };
}

async function switchRows(familyId: string) {
	const rows = await testDb()
		.select({
			module: dashboardModuleSwitches.module,
			enabled: dashboardModuleSwitches.enabled
		})
		.from(dashboardModuleSwitches)
		.where(eq(dashboardModuleSwitches.familyId, familyId));
	return rows.map((row) => [row.module, row.enabled]);
}

describe('PUT /api/families/{id}/modules/{module}', () => {
	beforeEach(truncateAll);

	it('lets an admin switch a family module off and writes the OFF row', async () => {
		const { user, family } = await seedFamily('admin');
		const other = await seedFamily('admin');
		const res = await invoke(putFamilyModuleSwitch, {
			ctx: ctx(),
			user,
			method: 'PUT',
			path: `/api/families/${family.id}/modules/board`,
			params: { id: family.id, module: 'board' },
			headers: { 'x-real-ip': '10.2.0.1' },
			body: { enabled: false }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true });
		expect(await switchRows(family.id)).toEqual([['board', false]]);
		// The switch is per family, never global.
		expect(await switchRows(other.family.id)).toEqual([]);
	});

	it('treats the family creator as an admin', async () => {
		const { user, family } = await seedFamily('creator');
		const res = await invoke(putFamilyModuleSwitch, {
			ctx: ctx(),
			user,
			method: 'PUT',
			path: `/api/families/${family.id}/modules/kids`,
			params: { id: family.id, module: 'kids' },
			headers: { 'x-real-ip': '10.2.0.2' },
			body: { enabled: false }
		});
		expect(res.status).toBe(200);
		expect(await switchRows(family.id)).toEqual([['kids', false]]);
	});

	it('re-enabling deletes the row — a row exists only while OFF', async () => {
		const { user, family } = await seedFamily('admin');
		await testDb()
			.insert(dashboardModuleSwitches)
			.values({ familyId: family.id, module: 'board', enabled: false });
		expect(await switchRows(family.id)).toEqual([['board', false]]);
		const res = await invoke(putFamilyModuleSwitch, {
			ctx: ctx(),
			user,
			method: 'PUT',
			path: `/api/families/${family.id}/modules/board`,
			params: { id: family.id, module: 'board' },
			headers: { 'x-real-ip': '10.2.0.3' },
			body: { enabled: true }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true });
		expect(await switchRows(family.id)).toEqual([]);
	});

	it('enabling a module that is already on writes no row', async () => {
		const { user, family } = await seedFamily('admin');
		const res = await invoke(putFamilyModuleSwitch, {
			ctx: ctx(),
			user,
			method: 'PUT',
			path: `/api/families/${family.id}/modules/groceries`,
			params: { id: family.id, module: 'groceries' },
			headers: { 'x-real-ip': '10.2.0.4' },
			body: { enabled: true }
		});
		expect(res.status).toBe(200);
		expect(await switchRows(family.id)).toEqual([]);
	});

	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const { family } = await seedFamily('admin');
		const res = await invoke(putFamilyModuleSwitch, {
			ctx: ctx(),
			method: 'PUT',
			path: `/api/families/${family.id}/modules/board`,
			params: { id: family.id, module: 'board' },
			headers: { 'x-real-ip': '10.2.0.5' },
			body: { enabled: false }
		});
		expect(res).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
	});

	it('answers 403 for a member who is not an admin', async () => {
		const { user, family } = await seedFamily('member');
		const res = await invoke(putFamilyModuleSwitch, {
			ctx: ctx(),
			user,
			method: 'PUT',
			path: `/api/families/${family.id}/modules/board`,
			params: { id: family.id, module: 'board' },
			headers: { 'x-real-ip': '10.2.0.6' },
			body: { enabled: false }
		});
		expect(res.status).toBe(403);
		expect(res.body).toEqual({ error: 'You do not have permission to perform this action' });
		expect(await switchRows(family.id)).toEqual([]);
	});

	it('answers 403 for someone who is not in the family', async () => {
		const { family } = await seedFamily(null);
		const stranger = await seedUser(testDb());
		const res = await invoke(putFamilyModuleSwitch, {
			ctx: ctx(),
			user: stranger,
			method: 'PUT',
			path: `/api/families/${family.id}/modules/board`,
			params: { id: family.id, module: 'board' },
			headers: { 'x-real-ip': '10.2.0.7' },
			body: { enabled: false }
		});
		expect(res.status).toBe(403);
		expect(res.body).toEqual({ error: 'You do not have permission to perform this action' });
		// An unknown family is the same refusal — this route never answers 404.
		const unknownFamily = await invoke(putFamilyModuleSwitch, {
			ctx: ctx(),
			user: stranger,
			method: 'PUT',
			path: '/api/families/does-not-exist/modules/board',
			params: { id: 'does-not-exist', module: 'board' },
			headers: { 'x-real-ip': '10.2.0.17' },
			body: { enabled: false }
		});
		expect(unknownFamily.status).toBe(403);
		expect(unknownFamily.body).toEqual({ error: 'You do not have permission to perform this action' });
	});

	it('checks permission before the module name, so a non-admin cannot probe ids', async () => {
		const { user, family } = await seedFamily('member');
		const res = await invoke(putFamilyModuleSwitch, {
			ctx: ctx(),
			user,
			method: 'PUT',
			path: `/api/families/${family.id}/modules/weather`,
			params: { id: family.id, module: 'weather' },
			headers: { 'x-real-ip': '10.2.0.8' },
			body: { enabled: false }
		});
		expect(res.status).toBe(403);
		expect(res.body).toEqual({ error: 'You do not have permission to perform this action' });
	});

	it('rejects an unknown module id with the legacy message', async () => {
		const { user, family } = await seedFamily('admin');
		const res = await invoke(putFamilyModuleSwitch, {
			ctx: ctx(),
			user,
			method: 'PUT',
			path: `/api/families/${family.id}/modules/weather`,
			params: { id: family.id, module: 'weather' },
			headers: { 'x-real-ip': '10.2.0.9' },
			body: { enabled: false }
		});
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'Unknown dashboard module: weather' });
	});

	it('rejects a personal module: it has no family master switch', async () => {
		const { user, family } = await seedFamily('admin');
		const res = await invoke(putFamilyModuleSwitch, {
			ctx: ctx(),
			user,
			method: 'PUT',
			path: `/api/families/${family.id}/modules/verse`,
			params: { id: family.id, module: 'verse' },
			headers: { 'x-real-ip': '10.2.0.10' },
			body: { enabled: false }
		});
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'Module is not family-scoped: verse' });
	});

	it('rejects an empty module name', async () => {
		const { user, family } = await seedFamily('admin');
		const res = await invoke(putFamilyModuleSwitch, {
			ctx: ctx(),
			user,
			method: 'PUT',
			path: `/api/families/${family.id}/modules/`,
			params: { id: family.id, module: '' },
			headers: { 'x-real-ip': '10.2.0.11' },
			body: { enabled: false }
		});
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'Module is required' });
	});

	it('requires a boolean enabled, absent or not', async () => {
		const { user, family } = await seedFamily('admin');
		const base = {
			ctx: ctx(),
			user,
			method: 'PUT',
			path: `/api/families/${family.id}/modules/board`,
			params: { id: family.id, module: 'board' }
		};
		const absent = await invoke(putFamilyModuleSwitch, {
			...base,
			headers: { 'x-real-ip': '10.2.0.12' },
			body: {}
		});
		expect(absent.status).toBe(400);
		expect(absent.body).toEqual({ error: 'enabled must be a boolean' });
		const wrongType = await invoke(putFamilyModuleSwitch, {
			...base,
			headers: { 'x-real-ip': '10.2.0.13' },
			body: { enabled: 'yes' }
		});
		expect(wrongType.status).toBe(400);
		expect(wrongType.body).toEqual({ error: 'enabled must be a boolean' });
		const nullValue = await invoke(putFamilyModuleSwitch, {
			...base,
			headers: { 'x-real-ip': '10.2.0.16' },
			body: { enabled: null }
		});
		expect(nullValue.status).toBe(400);
		expect(nullValue.body).toEqual({ error: 'enabled must be a boolean' });
		expect(await switchRows(family.id)).toEqual([]);
	});

	it('answers 400 {"error":"Invalid JSON"} for a malformed or non-object body', async () => {
		const { user, family } = await seedFamily('admin');
		const base = {
			ctx: ctx(),
			user,
			method: 'PUT',
			path: `/api/families/${family.id}/modules/board`,
			params: { id: family.id, module: 'board' }
		};
		const malformed = await invoke(putFamilyModuleSwitch, {
			...base,
			headers: { 'x-real-ip': '10.2.0.14', 'content-type': 'application/json' },
			rawBody: '{'
		});
		expect(malformed.status).toBe(400);
		expect(malformed.body).toEqual({ error: 'Invalid JSON' });
		const arrayBody = await invoke(putFamilyModuleSwitch, {
			...base,
			headers: { 'x-real-ip': '10.2.0.15', 'content-type': 'application/json' },
			rawBody: '[{"enabled":false}]'
		});
		expect(arrayBody.status).toBe(400);
		expect(arrayBody.body).toEqual({ error: 'Invalid JSON' });
	});
});

describe('PUT /api/me/dashboard-modules', () => {
	beforeEach(truncateAll);

	async function settingsRow(userId: string) {
		const [row] = await testDb()
			.select({
				hidden: userSettings.hiddenDashboardModules,
				verse: userSettings.showDailyVerse,
				zone: userSettings.timeZone
			})
			.from(userSettings)
			.where(eq(userSettings.userId, userId));
		return row;
	}

	it('saves canonical ids only and reports how many cards stay on', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(putMyDashboardModules, {
			ctx: ctx(),
			user,
			method: 'PUT',
			path: '/api/me/dashboard-modules',
			headers: { 'x-real-ip': '10.3.0.1' },
			body: { hidden: ['board', 'verse', 'memberStrip', 'nope'] }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			success: true,
			message: 'Dashboard modules saved — 6 of 8 cards on.',
			hidden: ['verse', 'board']
		});
		// The posted order is not the saved order: the canonical list decides.
		expect(await settingsRow(user.id)).toEqual({
			hidden: ['verse', 'board'],
			verse: false,
			zone: 'UTC'
		});
	});

	it('rebuilds the list in canonical order and collapses duplicates', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(putMyDashboardModules, {
			ctx: ctx(),
			user,
			method: 'PUT',
			path: '/api/me/dashboard-modules',
			headers: { 'x-real-ip': '10.3.0.2' },
			body: { hidden: ['groceries', 'verse', 'groceries'] }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			success: true,
			message: 'Dashboard modules saved — 7 of 8 cards on.',
			hidden: ['verse', 'groceries']
		});
	});

	it('an empty list turns every card back on', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(putMyDashboardModules, {
			ctx: ctx(),
			user,
			method: 'PUT',
			path: '/api/me/dashboard-modules',
			headers: { 'x-real-ip': '10.3.0.3' },
			body: { hidden: [] }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			success: true,
			message: 'Dashboard modules saved — all 8 cards on.',
			hidden: []
		});
		expect(await settingsRow(user.id)).toEqual({ hidden: [], verse: false, zone: 'UTC' });
	});

	it('creates the settings row when the user has none', async () => {
		const user = await seedUser(testDb());
		const [before] = await testDb()
			.select({ n: count() })
			.from(userSettings)
			.where(eq(userSettings.userId, user.id));
		expect(before.n).toBe(0);
		await invoke(putMyDashboardModules, {
			ctx: ctx(),
			user,
			method: 'PUT',
			path: '/api/me/dashboard-modules',
			headers: { 'x-real-ip': '10.3.0.4' },
			body: { hidden: ['kids'] }
		});
		const after = await testDb()
			.select({
				weekStart: userSettings.weekStart,
				zone: userSettings.timeZone,
				view: userSettings.defaultView,
				verse: userSettings.showDailyVerse,
				translation: userSettings.verseTranslation,
				ads: userSettings.showAdsAsEvents,
				defaultCalendarId: userSettings.defaultCalendarId,
				hidden: userSettings.hiddenDashboardModules
			})
			.from(userSettings)
			.where(eq(userSettings.userId, user.id));
		expect(after).toEqual([
			{
				weekStart: 'sunday',
				zone: 'UTC',
				view: 'dayView',
				verse: false,
				translation: 'esv',
				ads: false,
				defaultCalendarId: null,
				hidden: ['kids']
			}
		]);
	});

	it('replaces an existing hidden list without touching the other settings', async () => {
		const user = await seedUser(testDb());
		await testDb().insert(userSettings).values({
			userId: user.id,
			hiddenDashboardModules: ['kids'],
			showDailyVerse: true,
			timeZone: 'Europe/Madrid'
		});
		const res = await invoke(putMyDashboardModules, {
			ctx: ctx(),
			user,
			method: 'PUT',
			path: '/api/me/dashboard-modules',
			headers: { 'x-real-ip': '10.3.0.5' },
			body: { hidden: ['groceries'] }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			success: true,
			message: 'Dashboard modules saved — 7 of 8 cards on.',
			hidden: ['groceries']
		});
		expect(await settingsRow(user.id)).toEqual({
			hidden: ['groceries'],
			verse: true,
			zone: 'Europe/Madrid'
		});
		const [rows] = await testDb()
			.select({ n: count() })
			.from(userSettings)
			.where(eq(userSettings.userId, user.id));
		expect(rows.n).toBe(1);
	});

	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const res = await invoke(putMyDashboardModules, {
			ctx: ctx(),
			method: 'PUT',
			path: '/api/me/dashboard-modules',
			headers: { 'x-real-ip': '10.3.0.6' },
			body: { hidden: [] }
		});
		expect(res).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
	});

	it('requires an array of module ids', async () => {
		const user = await seedUser(testDb());
		const base = {
			ctx: ctx(),
			user,
			method: 'PUT',
			path: '/api/me/dashboard-modules'
		};
		const absent = await invoke(putMyDashboardModules, {
			...base,
			headers: { 'x-real-ip': '10.3.0.7' },
			body: {}
		});
		expect(absent.status).toBe(400);
		expect(absent.body).toEqual({ error: 'hidden must be an array of module ids' });
		const notArray = await invoke(putMyDashboardModules, {
			...base,
			headers: { 'x-real-ip': '10.3.0.8' },
			body: { hidden: 'board' }
		});
		expect(notArray.status).toBe(400);
		expect(notArray.body).toEqual({ error: 'hidden must be an array of module ids' });
		const wrongElement = await invoke(putMyDashboardModules, {
			...base,
			headers: { 'x-real-ip': '10.3.0.9' },
			body: { hidden: ['board', 3] }
		});
		expect(wrongElement.status).toBe(400);
		expect(wrongElement.body).toEqual({ error: 'hidden must be an array of module ids' });
		const nullValue = await invoke(putMyDashboardModules, {
			...base,
			headers: { 'x-real-ip': '10.3.0.12' },
			body: { hidden: null }
		});
		expect(nullValue.status).toBe(400);
		expect(nullValue.body).toEqual({ error: 'hidden must be an array of module ids' });
		expect(await settingsRow(user.id)).toBeUndefined();
	});

	it('answers 400 {"error":"Invalid JSON"} for a malformed body', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(putMyDashboardModules, {
			ctx: ctx(),
			user,
			method: 'PUT',
			path: '/api/me/dashboard-modules',
			headers: { 'x-real-ip': '10.3.0.10', 'content-type': 'application/json' },
			rawBody: '{"hidden":'
		});
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'Invalid JSON' });
	});

	it('drops every unknown id and answers 200, unlike the family switch route', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(putMyDashboardModules, {
			ctx: ctx(),
			user,
			method: 'PUT',
			path: '/api/me/dashboard-modules',
			headers: { 'x-real-ip': '10.3.0.11' },
			body: { hidden: ['retired-module', 'nope'] }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			success: true,
			message: 'Dashboard modules saved — all 8 cards on.',
			hidden: []
		});
	});
});
