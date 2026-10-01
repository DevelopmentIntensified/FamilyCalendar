import { describe, it, expect } from 'vitest';
import { DASHBOARD_MODULES, dashboardVisibility, isDashboardModule } from '$lib/dashboardModules';

/**
 * The composition used to live here, next to the rows it reads. It is pure, so
 * it moved to `$lib/dashboardModules` (109) where the module vocabulary is, and
 * the client-side DayDashboard can reach it too. These tests keep every
 * property it had to hold; the reader that answers "is this module visible to
 * this viewer" is `dashboardVisibility(...).modules`.
 */

const allOn = {
	board: true,
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
	kids: true,
	groceries: true,
	meals: true
};

/** The two facts a viewer contributes from their settings row. */
type SavedFacts = { showDailyVerse?: boolean | null; hiddenDashboardModules?: string[] | null };

/** The viewer's own saved row: verse setting on, nothing hidden. */
const untouched: SavedFacts = { showDailyVerse: true, hiddenDashboardModules: [] };

/** The composed map for one viewer. */
function visibilityFor(settings: SavedFacts | null, familySwitches: Record<string, boolean> = {}) {
	return dashboardVisibility({ settings, familySwitches }).modules;
}

describe('isDashboardModule', () => {
	it('accepts every canonical module id', () => {
		for (const id of [
			'verse',
			'glance',
			'top3',
			'completed',
			'board',
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

	it('rejects the retired member strip id (103)', () => {
		expect(isDashboardModule('memberStrip')).toBe(false);
	});
});

describe('dashboardVisibility — the composition', () => {
	it('defaults everything to visible', () => {
		expect(visibilityFor(untouched)).toEqual(allVisible);
	});

	it('a family master switch off hides that module for everyone', () => {
		const v = visibilityFor(untouched, { board: false });
		expect(v.board).toBe(false);
		expect(v.kids).toBe(true);
	});

	it('kids and meals respect their family master switch', () => {
		const v = visibilityFor(untouched, { kids: false, meals: false });
		expect(v.kids).toBe(false);
		expect(v.meals).toBe(false);
		expect(v.board).toBe(true);
	});

	it('personal modules ignore family switches entirely', () => {
		const v = visibilityFor(untouched, { verse: false, glance: false });
		expect(v.verse).toBe(true);
		expect(v.glance).toBe(true);
	});

	it('a per-user hidden module is hidden even when family switch is on', () => {
		const v = visibilityFor(
			{ showDailyVerse: true, hiddenDashboardModules: ['top3', 'kids'] },
			allOn
		);
		expect(v.top3).toBe(false);
		expect(v.kids).toBe(false);
		expect(v.board).toBe(true);
	});

	it('family-off plus user-hidden stays hidden', () => {
		expect(visibilityFor({ showDailyVerse: true, hiddenDashboardModules: ['board'] }, { board: false }).board).toBe(
			false
		);
	});

	it('user hides do not bypass a family-off switch', () => {
		// hidden, not visible — no bypass
		expect(visibilityFor({ showDailyVerse: true, hiddenDashboardModules: ['board'] }, { board: true }).board).toBe(
			false
		);
	});

	it('ignores unknown entries in the hidden list', () => {
		expect(visibilityFor({ showDailyVerse: true, hiddenDashboardModules: ['widget', 'nope'] })).toEqual(
			allVisible
		);
	});

	it('completed is personal: family switch ignored, user hide honored', () => {
		expect(visibilityFor(untouched, { completed: false }).completed).toBe(true);
		expect(visibilityFor({ showDailyVerse: true, hiddenDashboardModules: ['completed'] }).completed).toBe(false);
	});

	it('a null hidden list is an empty one', () => {
		expect(visibilityFor({ showDailyVerse: true, hiddenDashboardModules: null })).toEqual(allVisible);
	});
});

describe('the Groceries card as a Dashboard Module (081)', () => {
	it('is a canonical id, so a saved hidden list can name it', () => {
		expect(isDashboardModule('groceries')).toBe(true);
	});

	it('is family-scoped: an admin switch off hides it for everyone', () => {
		expect(visibilityFor(untouched, { groceries: false }).groceries).toBe(false);
		expect(visibilityFor(untouched).groceries).toBe(true);
	});

	it('family-off beats a member saying they can still see it', () => {
		expect(
			visibilityFor({ showDailyVerse: true, hiddenDashboardModules: ['board'] }, { groceries: false })
				.groceries
		).toBe(false);
	});

	it('each member can still hide it for themself alone', () => {
		expect(
			visibilityFor({ showDailyVerse: true, hiddenDashboardModules: ['groceries'] }, { groceries: true })
				.groceries
		).toBe(false);
	});
});

describe('the retired member strip id in saved state (103)', () => {
	it('a per-user hidden list still naming it is dropped, not honoured', () => {
		// The pin: a user who hid the strip before it was retired. The composer
		// filters the saved list through the canonical check, so the id is inert
		// — no throw, no resurrected key, and the modules that are still here
		// keep composing exactly as they always did.
		const v = visibilityFor({ showDailyVerse: true, hiddenDashboardModules: ['memberStrip', 'board'] });
		expect(v).toEqual({ ...allVisible, board: false });
		expect(Object.keys(v)).not.toContain('memberStrip');
	});

	it('a stale family master-switch row is inert, not fatal', () => {
		// A family that had the strip switched off still holds the row. The
		// composer only ever reads canonical ids, so it is ignored; the row
		// itself is cleared by sql/015 (and setFamilyModuleSwitch throws on an
		// unknown id, so nothing can write it back).
		const v = visibilityFor(untouched, { memberStrip: false });
		expect(v).toEqual(allVisible);
		expect(Object.keys(v)).not.toContain('memberStrip');
	});

	it('cannot be written back: the saved list is rebuilt from canonical ids', () => {
		// /account's saveCalendarSettings rebuilds hiddenDashboardModules from
		// the canonical list minus the posted checkboxes, so a stale id clears
		// itself on the next save and can never fail one.
		const saved = DASHBOARD_MODULES.map((m) => m.id).filter((id) => id !== 'board');
		expect(saved).not.toContain('memberStrip');
		expect(visibilityFor({ showDailyVerse: true, hiddenDashboardModules: saved }).board).toBe(true);
	});
});