/**
 * Pure row rules: one row's state, its two chip labels, its tone and the value
 * its toggle submits. Expected values come from the rule (README Invariants)
 * and the legacy pure test it cites, never from running the code.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { DASHBOARD_MODULES, type ModuleScope } from './dashboardModules.registry.rules';
import {
	describeDashboardModuleRow,
	type DashboardModuleRowInfo,
	type ModuleRowState
} from './dashboardModules.row.rules';

type RowInput = {
	readonly scope: ModuleScope;
	readonly enabled: boolean;
	readonly hiddenForViewer: boolean;
};

/** The state, labels and submit value a row shows for one set of facts. */
function rowFor(state: ModuleRowState, scope: ModuleScope = 'family'): DashboardModuleRowInfo {
	return describeDashboardModuleRow({
		scope,
		enabled: state !== 'off',
		hiddenForViewer: state === 'hidden-for-me'
	});
}

describe('describeDashboardModuleRow — state', () => {
	// Legacy table, src/lib/utils/moduleRowState.test.ts:13-26.
	it.each<[string, RowInput, ModuleRowState]>([
		['on', { scope: 'family', enabled: true, hiddenForViewer: false }, 'on'],
		['off', { scope: 'family', enabled: false, hiddenForViewer: false }, 'off'],
		[
			'hidden-for-me',
			{ scope: 'family', enabled: true, hiddenForViewer: true },
			'hidden-for-me'
		],
		[
			'family-off outranks the viewer hide',
			{ scope: 'family', enabled: false, hiddenForViewer: true },
			'off'
		],
		// Legacy table, src/lib/utils/moduleRowState.test.ts:28-35: a personal module
		// has no family switch, so a stale hidden-list entry cannot downgrade it
		// here. (Unreachable from today's callers: the family page lists only
		// family modules. Whether /account should ever show hidden-for-me for a
		// personal module is an S7 design question.)
		[
			'a personal module the viewer hid still reads on',
			{ scope: 'personal', enabled: true, hiddenForViewer: true },
			'on'
		],
		[
			'a personal module that is off',
			{ scope: 'personal', enabled: false, hiddenForViewer: false },
			'off'
		],
		[
			'a personal module that is on',
			{ scope: 'personal', enabled: true, hiddenForViewer: false },
			'on'
		]
	])('%s', (_label, input, expected) => {
		expect(describeDashboardModuleRow(input).state).toBe(expected);
	});

	// Legacy case, src/lib/utils/moduleRowState.test.ts:37.
	it('covers every canonical module id without throwing', () => {
		for (const module of DASHBOARD_MODULES) {
			for (const enabled of [true, false]) {
				for (const hiddenForViewer of [true, false]) {
					expect(() =>
						describeDashboardModuleRow({ scope: module.scope, enabled, hiddenForViewer })
					).not.toThrow();
				}
			}
		}
	});
});

describe('describeDashboardModuleRow — vocabulary', () => {
	// Legacy cases, src/lib/utils/moduleRowState.test.ts:50-62.
	it('uses the issue vocabulary for the scope chip', () => {
		expect(rowFor('on', 'personal').scopeLabel).toBe('Personal');
		expect(rowFor('on', 'family').scopeLabel).toBe('Family-wide');
	});

	it('names each state so label + scope + state read as one row', () => {
		expect(rowFor('on').stateLabel).toBe('On');
		expect(rowFor('off').stateLabel).toBe('Off');
		expect(rowFor('hidden-for-me').stateLabel).toBe('Hidden for you');
	});

	it('names each state once and submits the opposite of the current switch', () => {
		const rows = (['on', 'off', 'hidden-for-me'] as const).map((state) => rowFor(state));
		expect(rows.map((row) => row.stateLabel)).toEqual(['On', 'Off', 'Hidden for you']);
		expect(rows.map((row) => row.submitValue)).toEqual(['false', 'true', 'false']);
	});

	// Legacy cases, src/lib/utils/moduleRowState.test.ts:65-75.
	it('gives each state a distinct tone', () => {
		const tones = (['on', 'off', 'hidden-for-me'] as const).map((state) => rowFor(state).stateClass);
		expect(new Set(tones).size).toBe(3);
		for (const tone of tones) expect(tone.length).toBeGreaterThan(0);
	});

	it('an off row never wears the on tone', () => {
		expect(rowFor('off').stateClass).not.toBe(rowFor('on').stateClass);
	});
});

describe('describeDashboardModuleRow — submit value', () => {
	// Legacy cases, src/lib/utils/moduleRowState.test.ts:77-92.
	it.each<[boolean, 'true' | 'false']>([
		[true, 'false'],
		[false, 'true']
	])('submits %s as %s — the opposite of the current family switch', (enabled, expected) => {
		expect(
			describeDashboardModuleRow({ scope: 'family', enabled, hiddenForViewer: false }).submitValue
		).toBe(expected);
	});

	it('flips off the master switch even when the row reads hidden-for-me', () => {
		// hidden-for-me means the master switch is still ON, so the row must
		// submit 'false' — never 'true', which would leave the card hidden
		// for the viewer while claiming the family has it.
		expect(rowFor('hidden-for-me').submitValue).toBe('false');
	});
});
