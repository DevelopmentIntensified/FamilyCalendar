/**
 * The dashboardModules repo against real Postgres: the seeded default, the OFF
 * rows applied, and the two write shapes that make a row exist only while OFF.
 * Each test runs in `rollbackTest`, so the rows it seeds vanish afterwards;
 * writes are given their `now`, so the stamped timestamps are asserted rather
 * than trusted to a clock.
 *
 * Doc: ./README.md#how-to-test
 */
import { and, eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import type { Db } from '$lib/kernel/db/database.server';
import { dashboardModuleSwitches } from '$lib/kernel/db/tables.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { seedFamilySwitch, seedFamilyWithRole } from './dashboardModules.fixtures.server';
import { readFamilyModuleSwitches, writeFamilyModuleSwitch } from './dashboardModules.repo.server';

const NOW = new Date('2026-04-01T12:00:00Z');
const LATER = new Date('2026-05-01T12:00:00Z');

/** Every family-scoped module on: what a family with no rows reads as. */
const ALL_ON = { board: true, kids: true, groceries: true, meals: true };

/** The rows stored for one family, as `[module, enabled]` pairs in a stable order. */
async function storedSwitches(db: Db, familyId: string) {
	const rows = await db
		.select({
			module: dashboardModuleSwitches.module,
			enabled: dashboardModuleSwitches.enabled
		})
		.from(dashboardModuleSwitches)
		.where(eq(dashboardModuleSwitches.familyId, familyId))
		.orderBy(dashboardModuleSwitches.module);
	return rows.map((row) => [row.module, row.enabled]);
}

/** The timestamps of the one row stored for a family and module. */
async function storedStamps(db: Db, familyId: string, module: string) {
	const [row] = await db
		.select({
			createdAt: dashboardModuleSwitches.createdAt,
			updatedAt: dashboardModuleSwitches.updatedAt
		})
		.from(dashboardModuleSwitches)
		.where(
			and(
				eq(dashboardModuleSwitches.familyId, familyId),
				eq(dashboardModuleSwitches.module, module)
			)
		);
	if (!row) throw new Error(`no ${module} row stored for ${familyId}`);
	return { createdAt: row.createdAt.getTime(), updatedAt: row.updatedAt.getTime() };
}

describe('readFamilyModuleSwitches', () => {
	rollbackTest('defaults every family-scoped module to on', async (db) => {
		const { family } = await seedFamilyWithRole(db, 'admin');
		expect(await readFamilyModuleSwitches(db, family.id)).toEqual(ALL_ON);
	});

	rollbackTest('applies the OFF rows and leaves the rest on', async (db) => {
		const { family } = await seedFamilyWithRole(db, 'admin');
		await seedFamilySwitch(db, { familyId: family.id, module: 'board' });
		await seedFamilySwitch(db, { familyId: family.id, module: 'kids' });
		expect(await readFamilyModuleSwitches(db, family.id)).toEqual({
			...ALL_ON,
			board: false,
			kids: false
		});
	});

	rollbackTest('a switch belongs to one family, never to the other', async (db) => {
		const first = await seedFamilyWithRole(db, 'admin');
		const second = await seedFamilyWithRole(db, 'member');
		await seedFamilySwitch(db, { familyId: first.family.id, module: 'board' });
		expect((await readFamilyModuleSwitches(db, first.family.id)).board).toBe(false);
		expect(await readFamilyModuleSwitches(db, second.family.id)).toEqual(ALL_ON);
	});

	rollbackTest('reads a stale id row back verbatim; the composition makes it inert', async (db) => {
		const { family } = await seedFamilyWithRole(db, 'admin');
		await seedFamilySwitch(db, { familyId: family.id, module: 'memberStrip' });
		const switches = await readFamilyModuleSwitches(db, family.id);
		expect(switches).toEqual({ ...ALL_ON, memberStrip: false });
		// The personal modules are never family-switchable, so they never appear.
		expect(switches).not.toHaveProperty('verse');
		expect(switches).not.toHaveProperty('glance');
	});
});

describe('writeFamilyModuleSwitch', () => {
	rollbackTest('disabling inserts the OFF row stamped with the caller now', async (db) => {
		const { family } = await seedFamilyWithRole(db, 'admin');
		await writeFamilyModuleSwitch(db, {
			familyId: family.id,
			module: 'board',
			enabled: false,
			now: NOW
		});
		expect(await storedSwitches(db, family.id)).toEqual([['board', false]]);
		expect(await storedStamps(db, family.id, 'board')).toEqual({
			createdAt: NOW.getTime(),
			updatedAt: NOW.getTime()
		});
	});

	rollbackTest('enabling deletes the row — a row exists only while OFF', async (db) => {
		const { family } = await seedFamilyWithRole(db, 'admin');
		await seedFamilySwitch(db, { familyId: family.id, module: 'board' });
		expect(await storedSwitches(db, family.id)).toEqual([['board', false]]);
		await writeFamilyModuleSwitch(db, {
			familyId: family.id,
			module: 'board',
			enabled: true,
			now: NOW
		});
		expect(await storedSwitches(db, family.id)).toEqual([]);
	});

	rollbackTest('enabling deletes only that module, in that family', async (db) => {
		const first = await seedFamilyWithRole(db, 'admin');
		const second = await seedFamilyWithRole(db, 'admin');
		await seedFamilySwitch(db, { familyId: first.family.id, module: 'board' });
		await seedFamilySwitch(db, { familyId: first.family.id, module: 'kids' });
		await seedFamilySwitch(db, { familyId: second.family.id, module: 'board' });
		await writeFamilyModuleSwitch(db, {
			familyId: first.family.id,
			module: 'board',
			enabled: true,
			now: NOW
		});
		// Same family, other module: kept. Other family, same module: kept.
		expect(await storedSwitches(db, first.family.id)).toEqual([['kids', false]]);
		expect(await storedSwitches(db, second.family.id)).toEqual([['board', false]]);
	});

	rollbackTest('enabling a module that is already on writes nothing', async (db) => {
		const { family } = await seedFamilyWithRole(db, 'admin');
		await writeFamilyModuleSwitch(db, {
			familyId: family.id,
			module: 'groceries',
			enabled: true,
			now: NOW
		});
		expect(await storedSwitches(db, family.id)).toEqual([]);
	});

	rollbackTest('disabling twice keeps one row and the first write time', async (db) => {
		const { family } = await seedFamilyWithRole(db, 'admin');
		await writeFamilyModuleSwitch(db, {
			familyId: family.id,
			module: 'kids',
			enabled: false,
			now: NOW
		});
		await writeFamilyModuleSwitch(db, {
			familyId: family.id,
			module: 'kids',
			enabled: false,
			now: LATER
		});
		expect(await storedSwitches(db, family.id)).toEqual([['kids', false]]);
		// The conflict clause never rewrites an existing row.
		expect(await storedStamps(db, family.id, 'kids')).toEqual({
			createdAt: NOW.getTime(),
			updatedAt: NOW.getTime()
		});
	});

	rollbackTest("one family's write never touches another family's row", async (db) => {
		const first = await seedFamilyWithRole(db, 'admin');
		const second = await seedFamilyWithRole(db, 'admin');
		await writeFamilyModuleSwitch(db, {
			familyId: first.family.id,
			module: 'board',
			enabled: false,
			now: NOW
		});
		expect(await storedSwitches(db, first.family.id)).toEqual([['board', false]]);
		expect(await storedSwitches(db, second.family.id)).toEqual([]);
	});

	rollbackTest('the same module can be off in two families at once', async (db) => {
		const first = await seedFamilyWithRole(db, 'admin');
		const second = await seedFamilyWithRole(db, 'admin');
		for (const { family } of [first, second]) {
			await writeFamilyModuleSwitch(db, {
				familyId: family.id,
				module: 'board',
				enabled: false,
				now: NOW
			});
		}
		expect(await storedSwitches(db, first.family.id)).toEqual([['board', false]]);
		expect(await storedSwitches(db, second.family.id)).toEqual([['board', false]]);
	});
});
