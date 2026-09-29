import { describe, it, expect } from 'vitest';
import {
	moduleRowState,
	moduleScopeLabel,
	moduleStateLabel,
	moduleToggleValue,
	moduleStateClass,
	type ModuleRowState
} from './moduleRowState';
import { DASHBOARD_MODULES } from '$lib/dashboardModules';

describe('moduleRowState', () => {
	it('reads the three real states off (enabled, hiddenForViewer)', () => {
		const table: Array<[boolean, boolean, ModuleRowState]> = [
			[true, false, 'on'],
			[false, false, 'off'],
			[true, true, 'hidden-for-me']
		];
		for (const [enabled, hiddenForViewer, want] of table) {
			expect(moduleRowState({ scope: 'family', enabled, hiddenForViewer })).toBe(want);
		}
	});

	it('family-off outranks hidden-for-me — one row, one truth', () => {
		expect(moduleRowState({ scope: 'family', enabled: false, hiddenForViewer: true })).toBe('off');
	});

	it('never returns hidden-for-me for a personal module', () => {
		// Personal modules have no family switch; a stale hidden-list entry
		// cannot downgrade them here.
		expect(moduleRowState({ scope: 'personal', enabled: true, hiddenForViewer: true })).toBe('on');
		expect(moduleRowState({ scope: 'personal', enabled: false, hiddenForViewer: false })).toBe(
			'off'
		);
	});

	it('covers every canonical module id without throwing', () => {
		for (const mod of DASHBOARD_MODULES) {
			for (const enabled of [true, false]) {
				for (const hiddenForViewer of [true, false]) {
					expect(() =>
						moduleRowState({ scope: mod.scope, enabled, hiddenForViewer })
					).not.toThrow();
				}
			}
		}
	});
});

describe('moduleScopeLabel', () => {
	it('uses the issue vocabulary', () => {
		expect(moduleScopeLabel('personal')).toBe('Personal');
		expect(moduleScopeLabel('family')).toBe('Family-wide');
	});
});

describe('moduleStateLabel', () => {
	it('names the state so label + scope + state read as one row', () => {
		expect(moduleStateLabel('on')).toBe('On');
		expect(moduleStateLabel('off')).toBe('Off');
		expect(moduleStateLabel('hidden-for-me')).toBe('Hidden for you');
	});
});

describe('moduleStateClass', () => {
	it('gives each state a distinct tone', () => {
		const tones = (['on', 'off', 'hidden-for-me'] as const).map(moduleStateClass);
		expect(new Set(tones).size).toBe(3);
		for (const tone of tones) expect(tone.length).toBeGreaterThan(0);
	});

	it('an off row never wears the on tone', () => {
		expect(moduleStateClass('off')).not.toBe(moduleStateClass('on'));
	});
});

describe('moduleToggleValue', () => {
	it('submits the opposite of the current family switch', () => {
		expect(moduleToggleValue(true)).toBe('false');
		expect(moduleToggleValue(false)).toBe('true');
	});

	it('flips off the master switch even when the row reads hidden-for-me', () => {
		// hidden-for-me means the master switch is still ON, so the row must
		// submit 'false' — never 'true', which would leave the card hidden
		// for the viewer while claiming the family has it.
		const state = moduleRowState({ scope: 'family', enabled: true, hiddenForViewer: true });
		expect(state).toBe('hidden-for-me');
		expect(moduleToggleValue(state !== 'off')).toBe('false');
	});
});
