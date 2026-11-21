/**
 * dashboardModules services against real Postgres: one test per Invariant that
 * involves IO, titled after the rule. Each runs in `rollbackTest`, so the rows
 * it seeds vanish afterwards; `testCtx({ db })` supplies the clock, the family
 * role comes from the seeded `familyMembers` row (family's `getViewerRole`), and
 * identity's two ports are memory fakes because the visibility read reaches
 * them through identity's settings service (R9).
 *
 * Expected values come from the legacy services (`familyData.ts:353-368`,
 * `accountData.ts:226-258`, `db/actions/dashboardModules.ts`) and the frozen
 * golden `dashboardModules.http.db.test.ts`.
 *
 * Doc: ./README.md#how-to-test
 */
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import { actorFromUser } from '$lib/kernel/ctx/actor';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import type { Db } from '$lib/kernel/db/database.server';
import { dashboardModuleSwitches, userSettings } from '$lib/kernel/db/tables.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import type { IdentityPorts } from '$lib/domains/identity/index.server';
import { seedFamilySwitch, seedFamilyWithRole } from './dashboardModules.fixtures.server';
import {
	getDashboardVisibility,
	listFamilyModuleSwitches,
	saveHiddenModules,
	setFamilyModuleSwitch
} from './dashboardModules.service.server';
import type { DashboardModulesVisibilityCtx } from './index.server';

const NOW = '2026-03-01T09:00:00.000Z';
const NOW_DATE = new Date(NOW);

/** Every family-scoped module on: what a family with no rows reads as. */
const ALL_ON = { board: true, kids: true, groceries: true, meals: true };

/** Identity's two ports, which the visibility read reaches through identity's settings service. */
const identityPorts: IdentityPorts = {
	calendarAccess: { listAccessibleCalendarIds: async () => [] },
	adConsent: { listConsentHistory: async () => [], recordConsentChange: async () => undefined }
};

/** The ctx the switch tests use: no ports, the role comes from the seeded membership row. */
function switchCtx(db: Db): Ctx {
	return testCtx({ db, now: NOW });
}

function visibilityCtx(db: Db): DashboardModulesVisibilityCtx {
	return { ...testCtx({ db, now: NOW }), ...identityPorts };
}

/** The rows stored for one family, as `[module, enabled, createdAt]` triples. */
async function storedSwitches(db: Db, familyId: string) {
	const rows = await db
		.select({
			module: dashboardModuleSwitches.module,
			enabled: dashboardModuleSwitches.enabled,
			createdAt: dashboardModuleSwitches.createdAt
		})
		.from(dashboardModuleSwitches)
		.where(eq(dashboardModuleSwitches.familyId, familyId))
		.orderBy(dashboardModuleSwitches.module);
	return rows.map((row) => [row.module, row.enabled, row.createdAt.getTime()]);
}

/** The settings row as the save leaves it. */
async function storedSettings(db: Db, userId: string) {
	const [row] = await db
		.select({
			hidden: userSettings.hiddenDashboardModules,
			verse: userSettings.showDailyVerse,
			zone: userSettings.timeZone
		})
		.from(userSettings)
		.where(eq(userSettings.userId, userId));
	return row;
}

describe('listFamilyModuleSwitches', () => {
	rollbackTest('seeds every family-scoped module on, then applies the OFF rows', async (db) => {
		const { family } = await seedFamilyWithRole(db, 'admin');
		const ctx = testCtx({ db });
		expect(await listFamilyModuleSwitches(ctx, family.id)).toEqual(ALL_ON);

		await seedFamilySwitch(db, { familyId: family.id, module: 'board' });
		expect(await listFamilyModuleSwitches(ctx, family.id)).toEqual({ ...ALL_ON, board: false });
	});

	rollbackTest('reads only the named family’s rows', async (db) => {
		const one = await seedFamilyWithRole(db, 'admin');
		const other = await seedFamilyWithRole(db, 'admin');
		await seedFamilySwitch(db, { familyId: one.family.id, module: 'kids' });

		const ctx = testCtx({ db });
		expect(await listFamilyModuleSwitches(ctx, other.family.id)).toEqual(ALL_ON);
	});
});

describe('setFamilyModuleSwitch', () => {
	rollbackTest('lets an admin switch a family module off, stamped with the caller’s now', async (db) => {
		const { user, family } = await seedFamilyWithRole(db, 'admin');
		await setFamilyModuleSwitch(switchCtx(db), actorFromUser(user, 'session'), {
			familyId: family.id,
			module: 'board',
			enabled: false
		});

		expect(await storedSwitches(db, family.id)).toEqual([['board', false, NOW_DATE.getTime()]]);
	});

	rollbackTest('treats the family creator as an admin', async (db) => {
		const { user, family } = await seedFamilyWithRole(db, 'creator');
		await setFamilyModuleSwitch(switchCtx(db), actorFromUser(user, 'session'), {
			familyId: family.id,
			module: 'kids',
			enabled: false
		});

		expect(await storedSwitches(db, family.id)).toEqual([['kids', false, NOW_DATE.getTime()]]);
	});

	rollbackTest('re-enabling deletes the row — a row exists only while OFF', async (db) => {
		const { user, family } = await seedFamilyWithRole(db, 'admin');
		await seedFamilySwitch(db, { familyId: family.id, module: 'board' });

		await setFamilyModuleSwitch(switchCtx(db), actorFromUser(user, 'session'), {
			familyId: family.id,
			module: 'board',
			enabled: true
		});

		expect(await storedSwitches(db, family.id)).toEqual([]);
	});

	rollbackTest('enabling a module that is already on writes no row', async (db) => {
		const { user, family } = await seedFamilyWithRole(db, 'admin');
		await setFamilyModuleSwitch(switchCtx(db), actorFromUser(user, 'session'), {
			familyId: family.id,
			module: 'groceries',
			enabled: true
		});

		expect(await storedSwitches(db, family.id)).toEqual([]);
	});

	rollbackTest('reads the role in the family named by the route, never another one', async (db) => {
		const admin = await seedFamilyWithRole(db, 'admin');
		const other = await seedFamilyWithRole(db, 'member');

		await expect(
			setFamilyModuleSwitch(switchCtx(db), actorFromUser(admin.user, 'session'), {
				familyId: other.family.id,
				module: 'board',
				enabled: false
			})
		).rejects.toMatchObject({ code: 'forbidden' });

		expect(await storedSwitches(other.family.id)).toEqual([]);
		expect(await storedSwitches(admin.family.id)).toEqual([]);
	});

	rollbackTest('refuses a plain member with 403 and writes nothing', async (db) => {
		const { user, family } = await seedFamilyWithRole(db, 'member');
		await expect(
			setFamilyModuleSwitch(switchCtx(db), actorFromUser(user, 'session'), {
				familyId: family.id,
				module: 'board',
				enabled: false
			})
		).rejects.toMatchObject({
			code: 'forbidden',
			message: 'You do not have permission to perform this action'
		});

		expect(await storedSwitches(db, family.id)).toEqual([]);
	});

	rollbackTest('refuses someone who is not in the family the same way, never a 404', async (db) => {
		const { user } = await seedFamilyWithRole(db, 'member');
		await expect(
			setFamilyModuleSwitch(switchCtx(db), actorFromUser(user, 'session'), {
				familyId: 'does-not-exist',
				module: 'board',
				enabled: false
			})
		).rejects.toMatchObject({
			code: 'forbidden',
			message: 'You do not have permission to perform this action'
		});
	});

	rollbackTest('checks the role before the module name, so a non-admin cannot probe ids', async (db) => {
		const { user, family } = await seedFamilyWithRole(db, 'member');
		await expect(
			setFamilyModuleSwitch(switchCtx(db), actorFromUser(user, 'session'), {
				familyId: family.id,
				module: 'weather',
				enabled: false
			})
		).rejects.toMatchObject({ code: 'forbidden' });
	});

	rollbackTest('refuses an empty module name before consulting the registry', async (db) => {
		const { user, family } = await seedFamilyWithRole(db, 'admin');
		await expect(
			setFamilyModuleSwitch(switchCtx(db), actorFromUser(user, 'session'), {
				familyId: family.id,
				module: '',
				enabled: false
			})
		).rejects.toMatchObject({ code: 'invalid', message: 'Module is required' });
	});

	rollbackTest('refuses an unknown id with the legacy message and writes nothing', async (db) => {
		const { user, family } = await seedFamilyWithRole(db, 'admin');
		await expect(
			setFamilyModuleSwitch(switchCtx(db), actorFromUser(user, 'session'), {
				familyId: family.id,
				module: 'weather',
				enabled: false
			})
		).rejects.toMatchObject({
			code: 'invalid',
			message: 'Unknown dashboard module: weather'
		});

		expect(await storedSwitches(db, family.id)).toEqual([]);
	});

	rollbackTest('refuses a personal module: it has no family master switch', async (db) => {
		const { user, family } = await seedFamilyWithRole(db, 'admin');
		await expect(
			setFamilyModuleSwitch(switchCtx(db), actorFromUser(user, 'session'), {
				familyId: family.id,
				module: 'verse',
				enabled: false
			})
		).rejects.toMatchObject({
			code: 'invalid',
			message: 'Module is not family-scoped: verse'
		});
	});
});

describe('saveHiddenModules', () => {
	rollbackTest('stores canonical ids only and answers how many cards stay on', async (db) => {
		const user = await seedUser(db);
		const result = await saveHiddenModules(testCtx({ db }), actorFromUser(user, 'session'), {
			hidden: ['board', 'verse', 'memberStrip', 'nope']
		});

		expect(result).toEqual({
			hidden: ['verse', 'board'],
			message: 'Dashboard modules saved — 6 of 8 cards on.'
		});
		expect(await storedSettings(db, user.id)).toEqual({
			hidden: ['verse', 'board'],
			verse: false,
			zone: 'UTC'
		});
	});

	rollbackTest('creates the settings row when the user has none', async (db) => {
		const user = await seedUser(db);
		await saveHiddenModules(testCtx({ db }), actorFromUser(user, 'session'), { hidden: ['kids'] });

		expect(await storedSettings(db, user.id)).toEqual({
			hidden: ['kids'],
			verse: false,
			zone: 'UTC'
		});
	});

	rollbackTest('replaces an existing list without touching the other settings', async (db) => {
		const user = await seedUser(db);
		await db.insert(userSettings).values({
			userId: user.id,
			hiddenDashboardModules: ['kids'],
			showDailyVerse: true,
			timeZone: 'Europe/Madrid'
		});

		await saveHiddenModules(testCtx({ db }), actorFromUser(user, 'session'), {
			hidden: ['groceries']
		});

		expect(await storedSettings(db, user.id)).toEqual({
			hidden: ['groceries'],
			verse: true,
			zone: 'Europe/Madrid'
		});
	});

	rollbackTest('drops every unknown id and turns every card back on', async (db) => {
		const user = await seedUser(db);
		const result = await saveHiddenModules(testCtx({ db }), actorFromUser(user, 'session'), {
			hidden: ['retired-module', 'nope']
		});

		expect(result).toEqual({
			hidden: [],
			message: 'Dashboard modules saved — all 8 cards on.'
		});
	});
});

describe('getDashboardVisibility', () => {
	rollbackTest('composes the family switch and the viewer’s hidden list', async (db) => {
		const { family } = await seedFamilyWithRole(db, 'admin');
		const user = await seedUser(db);
		await seedFamilySwitch(db, { familyId: family.id, module: 'board' });
		await db.insert(userSettings).values({
			userId: user.id,
			hiddenDashboardModules: ['groceries'],
			showDailyVerse: true
		});

		const visibility = await getDashboardVisibility(
			visibilityCtx(db),
			actorFromUser(user, 'session'),
			{ familyId: family.id }
		);

		expect([visibility.shows('board'), visibility.shows('groceries')]).toEqual([false, false]);
		expect([visibility.shows('kids'), visibility.shows('verse')]).toEqual([true, true]);
		// A hidden consumer releases its read; the verse still needs its own.
		expect([visibility.needs('groceries'), visibility.needs('familyTasks')]).toEqual([false, false]);
		expect(visibility.needs('verse')).toBe(true);
	});

	rollbackTest('a family-off switch wins over the viewer’s own preference', async (db) => {
		const { family } = await seedFamilyWithRole(db, 'admin');
		const user = await seedUser(db);
		await seedFamilySwitch(db, { familyId: family.id, module: 'board' });
		await db.insert(userSettings).values({ userId: user.id, hiddenDashboardModules: [] });

		const visibility = await getDashboardVisibility(
			visibilityCtx(db),
			actorFromUser(user, 'session'),
			{ familyId: family.id }
		);

		expect([visibility.shows('board'), visibility.shows('kids')]).toEqual([false, true]);
	});

	rollbackTest('no settings row means no verse — the setting is the gate, not a default-on', async (db) => {
		const { family } = await seedFamilyWithRole(db, 'admin');
		const user = await seedUser(db);

		const visibility = await getDashboardVisibility(
			visibilityCtx(db),
			actorFromUser(user, 'session'),
			{ familyId: family.id }
		);

		expect(visibility.shows('verse')).toBe(false);
		expect(visibility.needs('verse')).toBe(false);
		expect(visibility.shows('board')).toBe(true);
	});
});
