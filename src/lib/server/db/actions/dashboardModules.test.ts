import { describe, it, expect } from 'vitest';
import { composeModuleVisibility } from './dashboardModules';
import { isDashboardModule } from '$lib/dashboardModules';

describe('isDashboardModule', () => {
	it('accepts every canonical module id', () => {
		expect(isDashboardModule('verse')).toBe(true);
		expect(isDashboardModule('glance')).toBe(true);
		expect(isDashboardModule('top3')).toBe(true);
		expect(isDashboardModule('board')).toBe(true);
		expect(isDashboardModule('memberStrip')).toBe(true);
	});

	it('rejects unknown ids', () => {
		expect(isDashboardModule('kids')).toBe(false);
		expect(isDashboardModule('')).toBe(false);
		expect(isDashboardModule('BOARD')).toBe(false);
	});
});

describe('composeModuleVisibility', () => {
	const allOn: Record<string, boolean> = {
		board: true,
		memberStrip: true
	};

	it('defaults everything to visible', () => {
		const v = composeModuleVisibility({}, []);
		expect(v).toEqual({
			verse: true,
			glance: true,
			top3: true,
			board: true,
			memberStrip: true
		});
	});

	it('a family master switch off hides that module for everyone', () => {
		const v = composeModuleVisibility({ board: false }, []);
		expect(v.board).toBe(false);
		expect(v.memberStrip).toBe(true);
	});

	it('personal modules ignore family switches entirely', () => {
		const v = composeModuleVisibility({ verse: false, glance: false }, []);
		expect(v.verse).toBe(true);
		expect(v.glance).toBe(true);
	});

	it('a per-user hidden module is hidden even when family switch is on', () => {
		const v = composeModuleVisibility(allOn, ['top3', 'memberStrip']);
		expect(v.top3).toBe(false);
		expect(v.memberStrip).toBe(false);
		expect(v.board).toBe(true);
	});

	it('family-off plus user-hidden stays hidden', () => {
		const v = composeModuleVisibility({ board: false }, ['board']);
		expect(v.board).toBe(false);
	});

	it('user hides do not bypass a family-off switch', () => {
		const v = composeModuleVisibility({ board: true }, ['board']);
		expect(v.board).toBe(false); // hidden, not visible — no bypass
	});

	it('ignores unknown entries in the hidden list', () => {
		const v = composeModuleVisibility({}, ['kids', 'nope']);
		expect(v).toEqual({
			verse: true,
			glance: true,
			top3: true,
			board: true,
			memberStrip: true
		});
	});
});