/**
 * The Dashboard section's rows: registry order, the two bands, and the one
 * unmounted module (104/105: `meals` is parked, `glance`/`top3`/`completed` are
 * mounted even though they read no rows).
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { selectDashboardModules } from '$lib/domains/dashboardModules';
import {
	ACCOUNT_DASHBOARD_GROUPS,
	ACCOUNT_UNMOUNTED_MODULE_IDS,
	accountDashboardModules,
	isAccountModuleMounted
} from './account.dashboard.rules';

describe('accountDashboardModules', () => {
	it('lists the registry in its own order, with the mounted fact', () => {
		const rows = accountDashboardModules();
		expect(rows.map((row) => row.id)).toEqual(
			selectDashboardModules().map((module) => module.id)
		);
		expect(rows.find((row) => row.id === 'meals')).toEqual(
			expect.objectContaining({ label: 'Meals', mounted: false })
		);
		expect(rows.find((row) => row.id === 'glance')?.mounted).toBe(true);
	});

	it('puts the quiet strip above the cards', () => {
		expect(ACCOUNT_DASHBOARD_GROUPS.map((group) => group.band)).toEqual([
			'Above your cards',
			'Cards'
		]);
		expect(ACCOUNT_DASHBOARD_GROUPS[0].modules.map((module) => module.id)).toEqual(['verse']);
		expect(ACCOUNT_DASHBOARD_GROUPS[1].modules.map((module) => module.id)).toEqual([
			'glance',
			'top3',
			'completed',
			'board',
			'kids',
			'groceries',
			'meals'
		]);
	});

	it('declares exactly one unmounted module, and only meals', () => {
		expect(Object.keys(ACCOUNT_UNMOUNTED_MODULE_IDS)).toEqual(['meals']);
		expect(isAccountModuleMounted('meals')).toBe(false);
		for (const id of ['verse', 'glance', 'top3', 'completed', 'board', 'kids', 'groceries']) {
			expect(isAccountModuleMounted(id)).toBe(true);
		}
	});
});
