import { describe, it, expect } from 'vitest';
import { composeModuleVisibility } from './dashboardModules';
import { isDashboardModule } from '$lib/dashboardModules';

describe('isDashboardModule', () => {
	it('accepts every canonical module id', () => {
		for (const id of [
			'verse',
			'glance',
			'top3',
			'completed',
			'board',
			'memberStrip',
			'kids',
			'meals',
			'groceries'
		]) {
			expect(isDashboardModule(id)).toBe(true);
		}
	});

	it('rejects unknown ids', () => {
		expect(isDashboardModule('widget')).toBe(false);
		expect(isDashboardModule('')).toBe(false);
		expect(isDashboardModule('BOARD')).toBe(false);
	});
});

describe('composeModuleVisibility', () => {
	const allOn = {
		board: true,
		memberStrip: true,
		kids: true,
		meals: true,
		groceries: true
	};

	/** The full canonical map, all visible — what an untouched account has. */
	const allVisible = {
		verse: true,
		glance: true,
		top3: true,
		completed: true,
		board: true,
		memberStrip: true,
		kids: true,
		groceries: true,
		meals: true
	};

	it('defaults everything to visible', () => {
		const v = composeModuleVisibility({}, []);
		expect(v).toEqual(allVisible);
	});

	it('a family master switch off hides that module for everyone', () => {
		const v = composeModuleVisibility({ board: false }, []);
		expect(v.board).toBe(false);
		expect(v.memberStrip).toBe(true);
	});

	it('kids and meals respect their family master switch', () => {
		const v = composeModuleVisibility({ kids: false, meals: false }, []);
		expect(v.kids).toBe(false);
		expect(v.meals).toBe(false);
		expect(v.board).toBe(true);
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
		const v = composeModuleVisibility({}, ['widget', 'nope']);
		expect(v).toEqual(allVisible);
	});

	it('completed is personal: family switch ignored, user hide honored', () => {
		expect(composeModuleVisibility({ completed: false }, []).completed).toBe(true);
		expect(composeModuleVisibility({}, ['completed']).completed).toBe(false);
	});
});

describe('the Groceries card as a Dashboard Module (081)', () => {
	it('is a canonical id, so a saved hidden list can name it', () => {
		expect(isDashboardModule('groceries')).toBe(true);
	});

	it('is family-scoped: an admin switch off hides it for everyone', () => {
		expect(composeModuleVisibility({ groceries: false }, []).groceries).toBe(false);
		expect(composeModuleVisibility({}, []).groceries).toBe(true);
	});

	it('family-off beats a member saying they can still see it', () => {
		expect(composeModuleVisibility({ groceries: false }, ['board']).groceries).toBe(false);
	});

	it('each member can still hide it for themself alone', () => {
		expect(composeModuleVisibility({ groceries: true }, ['groceries']).groceries).toBe(false);
	});
});
