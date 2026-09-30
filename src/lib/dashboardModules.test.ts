import { describe, it, expect } from 'vitest';
import {
	CARD_DASHBOARD_MODULES,
	DASHBOARD_MODULES,
	INFO_DASHBOARD_MODULES,
	FAMILY_DASHBOARD_MODULES,
	isDashboardModule,
	verseIsVisible
} from './dashboardModules';
import { composeModuleVisibility } from '$lib/server/db/actions/dashboardModules';

/** A persisted userSettings row, shaped the way `getUserSettings` returns it.
 * Not a default — these rows already exist in the wild, and the verse move
 * (#080) has to leave every one of them meaning the same thing. */
type SavedSettings = {
	userId: string;
	showDailyVerse: boolean;
	verseTranslation: string;
	hiddenDashboardModules: string[] | null;
};

/** Verse on, never touched the module list. */
const savedVerseOn: SavedSettings = {
	userId: 'u-sarah',
	showDailyVerse: true,
	verseTranslation: 'esv',
	hiddenDashboardModules: []
};

/** Verse on, and its dashboard card hidden for themself before the move. */
const savedVerseHidden: SavedSettings = {
	userId: 'u-sarah',
	showDailyVerse: true,
	verseTranslation: 'esv',
	hiddenDashboardModules: ['verse', 'board']
};

/** Verse never switched on at all. */
const savedVerseOff: SavedSettings = {
	userId: 'u-eli',
	showDailyVerse: false,
	verseTranslation: 'kjv',
	hiddenDashboardModules: []
};

/** Hid the Member Strip for themself, back when it was still a module. */
const savedStripHidden: SavedSettings = {
	userId: 'u-sarah',
	showDailyVerse: true,
	verseTranslation: 'esv',
	hiddenDashboardModules: ['memberStrip']
};

/** The load's own two steps, run over a persisted row. */
function verseFor(row: SavedSettings): boolean {
	const modules = composeModuleVisibility({}, row.hiddenDashboardModules ?? []);
	return verseIsVisible({ showDailyVerse: row.showDailyVerse, modules });
}

describe('dashboard module bands (080)', () => {
	it('the Daily Verse is the one module in the info band', () => {
		expect(INFO_DASHBOARD_MODULES.map((m) => m.id)).toEqual(['verse']);
	});

	it('every other module still renders as a card', () => {
		expect(CARD_DASHBOARD_MODULES.map((m) => m.id)).toEqual([
			'glance',
			'top3',
			'completed',
			'board',
			'kids',
			'groceries',
			'meals'
		]);
	});

	it('info + card is every module — nothing is dropped by the move', () => {
		expect([...INFO_DASHBOARD_MODULES, ...CARD_DASHBOARD_MODULES].map((m) => m.id).sort()).toEqual(
			DASHBOARD_MODULES.map((m) => m.id).sort()
		);
	});

	it('the verse leaves the card band without leaving the module list', () => {
		// The switch is the same switch; only its meaning moved.
		const cardIds: string[] = CARD_DASHBOARD_MODULES.map((m) => m.id);
		expect(isDashboardModule('verse')).toBe(true);
		expect(cardIds).not.toContain('verse');
	});

	it('the verse stays personal — no family master switch claims it', () => {
		expect(FAMILY_DASHBOARD_MODULES.map((m) => m.id)).not.toContain('verse');
	});

	it('every module states what its switch means', () => {
		for (const mod of DASHBOARD_MODULES) {
			expect(mod.meaning.length).toBeGreaterThan(0);
		}
		// The verse's new meaning is about the verse, not about a band.
		const verse = DASHBOARD_MODULES.find((m) => m.id === 'verse')!;
		expect(verse.meaning.toLowerCase()).toContain('verse');
		expect(verse.meaning.toLowerCase()).not.toContain('card');
	});

	it('keeps every pre-move module id canonical, so saved states still apply', () => {
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

	it('groceries is a family card the family can switch off (081)', () => {
		const groceries = DASHBOARD_MODULES.find((m) => m.id === 'groceries')!;
		expect(groceries.band).toBe('card');
		expect(groceries.scope).toBe('family');
		expect(FAMILY_DASHBOARD_MODULES.map((m) => m.id)).toContain('groceries');
	});
});

describe('verseIsVisible — the verse switch means "show the verse" (080)', () => {
	it('a user who hid the verse before the move stays hidden', () => {
		// The pin: the saved hidden-list entry is what keeps the verse away.
		expect(verseFor(savedVerseHidden)).toBe(false);
	});

	it('a user who never hid it sees it as before', () => {
		expect(verseFor(savedVerseOn)).toBe(true);
	});

	it('verse off in settings stays off, whatever the hidden list says', () => {
		expect(verseFor(savedVerseOff)).toBe(false);
		expect(verseFor({ ...savedVerseOff, hiddenDashboardModules: null })).toBe(false);
	});

	it('hiding a card never hides the verse', () => {
		const row = { ...savedVerseOn, hiddenDashboardModules: ['board', 'kids'] };
		expect(verseFor(row)).toBe(true);
	});

	it('an absent visibility map is treated as visible, not as hidden', () => {
		expect(verseIsVisible({ showDailyVerse: true, modules: undefined })).toBe(true);
	});

	it('reads the composed map, not a fresh default', () => {
		const modules = composeModuleVisibility({}, ['verse']);
		expect(modules.verse).toBe(false);
		expect(verseIsVisible({ showDailyVerse: true, modules })).toBe(false);
	});
});

describe('the Member strip is no longer a Dashboard Module (103)', () => {
	it('the id is retired: a saved hidden list can no longer name it', () => {
		// The card is gone, so the id that switched it goes with it. An id that
		// names nothing is a switch for a lie.
		expect(isDashboardModule('memberStrip')).toBe(false);
	});

	it('leaves neither switch list with a row for it', () => {
		// The account page renders the band lists and the family page renders
		// FAMILY_DASHBOARD_MODULES, so both lose the row from this one entry.
		expect(CARD_DASHBOARD_MODULES.map((m) => m.id)).not.toContain('memberStrip');
		expect(INFO_DASHBOARD_MODULES.map((m) => m.id)).not.toContain('memberStrip');
		expect(FAMILY_DASHBOARD_MODULES.map((m) => m.id)).not.toContain('memberStrip');
	});

	it('a saved hidden list still naming it composes to a clean map', () => {
		// The state a real user is carrying out of the pre-103 dashboard. It
		// must not throw, must not resurrect anything, and must not disturb the
		// modules that are still here.
		const modules = composeModuleVisibility(
			{},
			savedStripHidden.hiddenDashboardModules ?? []
		);
		expect(modules).toEqual(composeModuleVisibility({}, []));
		expect(Object.keys(modules)).not.toContain('memberStrip');
	});

	it('that stale id leaves the verse exactly as it found it', () => {
		expect(verseFor(savedStripHidden)).toBe(true);
		expect(verseFor({ ...savedStripHidden, hiddenDashboardModules: ['memberStrip', 'verse'] })).toBe(
			false
		);
	});
});
