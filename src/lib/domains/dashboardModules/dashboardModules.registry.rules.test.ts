/**
 * Pure registry rules: the canonical list, its page filters, the canonical
 * check and the absent-is-visible reader. Expected values come from the rule
 * (README Invariants) and the legacy pure tests it cites, never from running
 * the code.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import {
	canonicalHiddenModules,
	DASHBOARD_MODULES,
	type DashboardBand,
	isDashboardModule,
	type ModuleScope,
	selectDashboardModules,
	showsModule
} from './dashboardModules.registry.rules';

const ALL_IDS = DASHBOARD_MODULES.map(({ id }) => id);

describe('the canonical registry', () => {
	// Legacy case, src/lib/dashboardModules.test.ts:53-111 (bands, meaning,
	// pre-move ids). The order, labels, scopes and bands are one table.
	it('keeps the canonical ids, scopes and bands in one fixed order', () => {
		expect(
			DASHBOARD_MODULES.map(({ id, label, scope, band }) => ({ id, label, scope, band }))
		).toEqual([
			{ id: 'verse', label: 'Daily Verse', scope: 'personal', band: 'info' },
			{ id: 'glance', label: 'Day at a Glance', scope: 'personal', band: 'card' },
			{ id: 'top3', label: 'Top 3 Priorities', scope: 'personal', band: 'card' },
			{ id: 'completed', label: 'Completed Today', scope: 'personal', band: 'card' },
			{ id: 'board', label: 'Family Task Board', scope: 'family', band: 'card' },
			{ id: 'kids', label: "Kids' Schedule", scope: 'family', band: 'card' },
			{ id: 'groceries', label: 'Groceries', scope: 'family', band: 'card' },
			{ id: 'meals', label: 'Meals', scope: 'family', band: 'card' }
		]);
	});

	// Legacy case, src/lib/dashboardModules.test.ts:86 — every switch states
	// what it means, and the verse's meaning is about the verse, not a band.
	it('states what every switch means', () => {
		for (const module of DASHBOARD_MODULES) expect(module.meaning.length).toBeGreaterThan(0);
		const verse = DASHBOARD_MODULES.find((module) => module.id === 'verse');
		expect(verse?.meaning.toLowerCase()).toContain('verse');
		expect(verse?.meaning.toLowerCase()).not.toContain('card');
	});
});

describe('selectDashboardModules', () => {
	it.each<[{ scope?: ModuleScope; band?: DashboardBand }, string[]]>([
		[{}, ALL_IDS],
		[{ scope: 'family' }, ['board', 'kids', 'groceries', 'meals']],
		[{ scope: 'personal' }, ['verse', 'glance', 'top3', 'completed']],
		// Legacy cases, src/lib/dashboardModules.test.ts:53-73.
		[{ band: 'info' }, ['verse']],
		[{ band: 'card' }, ['glance', 'top3', 'completed', 'board', 'kids', 'groceries', 'meals']],
		[{ scope: 'family', band: 'card' }, ['board', 'kids', 'groceries', 'meals']],
		[{ scope: 'personal', band: 'info' }, ['verse']],
		[{ scope: 'personal', band: 'card' }, ['glance', 'top3', 'completed']]
	])('selectDashboardModules(%j) → %j', (filter, expected) => {
		expect(selectDashboardModules(filter).map(({ id }) => id)).toEqual(expected);
	});

	it('info + card is every module — nothing is dropped by the move', () => {
		expect([
			...selectDashboardModules({ band: 'info' }),
			...selectDashboardModules({ band: 'card' })
		]).toHaveLength(DASHBOARD_MODULES.length);
	});

	it('the verse stays personal — no family master switch claims it', () => {
		expect(selectDashboardModules({ scope: 'family' }).map(({ id }) => id)).not.toContain('verse');
	});
});

describe('isDashboardModule', () => {
	// Legacy cases, src/lib/dashboardModules.test.ts:96 and
	// src/lib/server/db/actions/dashboardModules.test.ts:43-67.
	it.each<[string, boolean]>([
		['verse', true],
		['glance', true],
		['top3', true],
		['completed', true],
		['board', true],
		['kids', true],
		['groceries', true],
		['meals', true],
		['widget', false],
		['BOARD', false],
		['memberStrip', false],
		['', false]
	])('isDashboardModule(%j) → %s', (id, expected) => {
		expect(isDashboardModule(id)).toBe(expected);
	});

	it('rejects a retired id and keeps every pre-move id canonical', () => {
		const preMoveIds = [
			'verse',
			'glance',
			'top3',
			'completed',
			'board',
			'kids',
			'groceries',
			'meals'
		];
		for (const id of preMoveIds) expect(isDashboardModule(id)).toBe(true);
		expect(isDashboardModule('memberStrip')).toBe(false);
	});

	it('a retired id appears in no filtered list', () => {
		for (const filter of [{}, { scope: 'family' }, { band: 'info' }, { band: 'card' }] as const) {
			expect(selectDashboardModules(filter).map(({ id }) => id)).not.toContain('memberStrip');
		}
	});
});

describe('showsModule — the stated default is visible (109)', () => {
	// Legacy cases, src/lib/dashboardModules.test.ts:220-234.
	it.each<[string, Record<string, boolean> | undefined | null, string, boolean]>([
		['an absent map', undefined, 'verse', true],
		['a null map', null, 'board', true],
		['an empty map', {}, 'board', true],
		['an absent entry in a present map', { board: false }, 'kids', true],
		['an explicit false', { board: false }, 'board', false],
		['an explicit true', { board: true }, 'board', true],
		['an unknown id', { board: false }, 'widget', true]
	])('%s: showsModule(%j, %j) → %s', (_label, map, id, expected) => {
		expect(showsModule(map, id)).toBe(expected);
	});
});

describe('canonicalHiddenModules', () => {
	// Legacy: `DASHBOARD_MODULES.map(id).filter((id) => hidden.includes(id))` in
	// src/routes/api/me/dashboard-modules/+server.ts:22-25. Goldens: `saves
	// canonical ids only…`, `rebuilds the list in canonical order and collapses
	// duplicates`, `drops every unknown id and answers 200` (Q-029).
	it.each<[string, string[], string[]]>([
		['an empty list', [], []],
		['canonical ids unchanged', ['board', 'kids'], ['board', 'kids']],
		[
			'posted order is rebuilt as the canonical order',
			['kids', 'board', 'verse'],
			['verse', 'board', 'kids']
		],
		['duplicates collapse', ['kids', 'board', 'kids', 'board'], ['board', 'kids']],
		['unknown ids are dropped', ['widget', 'board', 'nope'], ['board']],
		['a retired id is dropped (103)', ['memberStrip', 'board'], ['board']],
		['ids are case-sensitive', ['BOARD', 'Board'], []],
		['only unknown ids leave nothing', ['widget'], []],
		['every id is kept, in registry order', [...ALL_IDS].reverse(), ALL_IDS]
	])('%s', (_label, posted, expected) => {
		expect(canonicalHiddenModules(posted)).toEqual(expected);
	});
});
