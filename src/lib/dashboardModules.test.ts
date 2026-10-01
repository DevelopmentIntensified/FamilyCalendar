import { describe, it, expect } from 'vitest';
import {
	CARD_DASHBOARD_MODULES,
	DASHBOARD_MODULES,
	DASHBOARD_READS,
	INFO_DASHBOARD_MODULES,
	FAMILY_DASHBOARD_MODULES,
	dashboardVisibility,
	isDashboardModule,
	showsModule,
	type DashboardModuleId,
	type DashboardRead
} from './dashboardModules';

/** A persisted userSettings row, shaped the way `getUserSettings` returns it.
 * Not a default — these rows already exist in the wild, and every rule below
 * has to leave each one meaning the same thing. */
type SavedSettings = {
	showDailyVerse: boolean;
	hiddenDashboardModules: string[] | null;
};

/** Verse on, never touched the module list. */
const savedVerseOn: SavedSettings = {
	showDailyVerse: true,
	hiddenDashboardModules: []
};

/** Verse on, and its module hidden for themself before the 080 move. */
const savedVerseHidden: SavedSettings = {
	showDailyVerse: true,
	hiddenDashboardModules: ['verse', 'board']
};

/** Verse never switched on at all. */
const savedVerseOff: SavedSettings = {
	showDailyVerse: false,
	hiddenDashboardModules: []
};

/** Hid the Member Strip for themself, back when it was still a module. */
const savedStripHidden: SavedSettings = {
	showDailyVerse: true,
	hiddenDashboardModules: ['memberStrip']
};

/** One loader's answer, composed from a saved row and the family switches. */
function visibilityFor(row: SavedSettings, familySwitches: Record<string, boolean> = {}) {
	return dashboardVisibility({ settings: row, familySwitches });
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

describe('dashboardVisibility — module id × persisted fact (109)', () => {
	/** Every module, against every persisted fact that can move it. The
	 * "one fact says hide, the other says show" rows are the ones the live
	 * bug lived in: the calendar loader read the setting and never the list. */
	const CASES: Array<{
		what: string;
		settings: SavedSettings;
		familySwitches?: Record<string, boolean>;
		visible: string[];
		hidden: string[];
	}> = [
		{
			what: 'the verse setting off while nothing is hidden',
			settings: { showDailyVerse: false, hiddenDashboardModules: [] },
			visible: ['glance', 'top3', 'completed', 'board', 'kids', 'groceries', 'meals'],
			hidden: ['verse']
		},
		{
			what: 'settings on, nothing hidden — the untouched account',
			settings: savedVerseOn,
			visible: DASHBOARD_MODULES.map((m) => m.id),
			hidden: []
		},
		{
			what: 'the verse hidden for themself while its setting stays on — the reported bug',
			settings: savedVerseHidden,
			visible: ['glance', 'top3', 'completed', 'kids', 'groceries', 'meals'],
			hidden: ['verse', 'board']
		},
		{
			what: 'the verse setting off while the module is left visible — the same disagreement, reversed',
			settings: savedVerseOff,
			visible: ['glance', 'top3', 'completed', 'board', 'kids', 'groceries', 'meals'],
			hidden: ['verse']
		},
		{
			what: 'a null hidden list is not a hidden module',
			settings: { showDailyVerse: true, hiddenDashboardModules: null },
			visible: DASHBOARD_MODULES.map((m) => m.id),
			hidden: []
		},
		{
			what: 'a family master switch off hides that module for everyone',
			settings: savedVerseOn,
			familySwitches: { board: false },
			visible: ['verse', 'glance', 'top3', 'completed', 'kids', 'groceries', 'meals'],
			hidden: ['board']
		},
		{
			what: 'family off plus the viewer hiding it too — still hidden, once',
			settings: savedVerseHidden,
			familySwitches: { board: false },
			visible: ['glance', 'top3', 'completed', 'kids', 'groceries', 'meals'],
			hidden: ['verse', 'board']
		},
		{
			what: 'family on cannot rescue a module the viewer hid for themself',
			settings: savedVerseHidden,
			familySwitches: { board: true },
			visible: ['glance', 'top3', 'completed', 'kids', 'groceries', 'meals'],
			hidden: ['verse', 'board']
		},
		{
			what: 'a personal module ignores the family switches entirely',
			settings: savedVerseOn,
			familySwitches: { verse: false, glance: false, top3: false, completed: false },
			visible: DASHBOARD_MODULES.map((m) => m.id),
			hidden: []
		}
	];

	it.each(CASES)('$what', ({ settings, familySwitches, visible, hidden }) => {
		const { modules } = visibilityFor(settings, familySwitches);
		expect(Object.entries(modules)
			.filter(([, on]) => on)
			.map(([id]) => id)
			.sort()).toEqual([...visible].sort());
		expect(Object.entries(modules)
			.filter(([, on]) => !on)
			.map(([id]) => id)
			.sort()).toEqual([...hidden].sort());
	});

	it.each(DASHBOARD_MODULES)('shows() and the map agree on $id', ({ id }) => {
		const { modules, shows } = visibilityFor(savedVerseHidden);
		expect(shows(id)).toBe(modules[id]);
	});

	it('every canonical id is present in the map, so a payload needs no defaulting', () => {
		const { modules } = visibilityFor(savedVerseOn);
		expect(Object.keys(modules).sort()).toEqual(DASHBOARD_MODULES.map((m) => m.id).sort());
	});

	it('a family switch for an id that is not canonical changes nothing', () => {
		const { modules } = visibilityFor(savedVerseOn, { memberStrip: false, widget: false });
		expect(Object.keys(modules)).not.toContain('memberStrip');
		expect(Object.keys(modules)).not.toContain('widget');
	});
});

describe('showsModule — the stated default is visible (109)', () => {
	it('an absent map is visible, not hidden', () => {
		for (const id of ['verse', 'board', 'kids']) {
			expect(showsModule(undefined, id)).toBe(true);
			expect(showsModule({}, id)).toBe(true);
		}
	});

	it('an absent module in a present map is visible too', () => {
		expect(showsModule({ board: false }, 'kids')).toBe(true);
	});

	it('an explicit false is hidden, and true is visible', () => {
		expect(showsModule({ board: false }, 'board')).toBe(false);
		expect(showsModule({ board: true }, 'board')).toBe(true);
	});
});

describe('the verse reads BOTH persisted facts (080/109)', () => {
	it('a user who hid the verse before the move stays hidden', () => {
		// The pin: the saved hidden-list entry is what keeps the verse away.
		expect(visibilityFor(savedVerseHidden).modules.verse).toBe(false);
	});

	it('a user who never hid it sees it as before', () => {
		expect(visibilityFor(savedVerseOn).modules.verse).toBe(true);
	});

	it('verse off in settings stays off, whatever the hidden list says', () => {
		expect(visibilityFor(savedVerseOff).modules.verse).toBe(false);
		expect(visibilityFor({ ...savedVerseOff, hiddenDashboardModules: null }).modules.verse).toBe(false);
	});

	it('hiding another card never hides the verse', () => {
		expect(visibilityFor({ ...savedVerseOn, hiddenDashboardModules: ['board', 'kids'] }).modules.verse).toBe(
			true
		);
	});

	it('no settings row means no verse — the setting is the gate, not a default-on', () => {
		expect(dashboardVisibility({ settings: null }).modules.verse).toBe(false);
	});

	it('needs("verse") is the verse read itself, so a loader cannot skip the wrong question', () => {
		expect(visibilityFor(savedVerseOn).needs('verse')).toBe(true);
		expect(visibilityFor(savedVerseHidden).needs('verse')).toBe(false);
		expect(visibilityFor(savedVerseOff).needs('verse')).toBe(false);
	});
});

describe('needs — which expensive reads a loader may skip (109)', () => {
	/** read × the modules that consume it × the hide that takes it away. */
	const READS: Array<{ read: DashboardRead; consumers: DashboardModuleId[] }> = [
		{ read: 'verse', consumers: ['verse'] },
		{ read: 'familyTasks', consumers: ['board'] },
		{ read: 'familyRoster', consumers: ['board', 'kids'] },
		{ read: 'familyDayEvents', consumers: ['glance', 'kids'] },
		{ read: 'kidsAttendance', consumers: ['kids'] },
		{ read: 'groceries', consumers: ['groceries'] }
	];

	it('an untouched account pays for every read', () => {
		const { needs } = visibilityFor(savedVerseOn);
		for (const { read } of READS) expect(needs(read)).toBe(true);
	});

	it.each(READS)('$read is needed while any of its consumers is visible', ({ read, consumers }) => {
		for (const consumer of consumers) {
			// Hide every OTHER consumer; this one alone must keep the read.
			const others = consumers.filter((c) => c !== consumer);
			const visibility = visibilityFor({
				showDailyVerse: true,
				hiddenDashboardModules: [...others]
			});
			expect(visibility.needs(read)).toBe(true);
			// Hide this one too — now nothing behind the read is on screen.
			const nothingLeft = visibilityFor({
				showDailyVerse: true,
				hiddenDashboardModules: [...consumers]
			});
			expect(nothingLeft.needs(read)).toBe(false);
		}
	});

	it('a family master switch off can retire a read on its own', () => {
		// Nobody hid anything; the family switched the last consumer off.
		expect(visibilityFor(savedVerseOn, { board: false }).needs('familyTasks')).toBe(false);
		// …but the roster is still wanted by Kids' Schedule.
		expect(visibilityFor(savedVerseOn, { board: false }).needs('familyRoster')).toBe(true);
	});

	it('Kids\' Schedule alone does not buy the whole family task board', () => {
		// The dashboard used to gate that SELECT on `board || kids`, so a
		// viewer with only Kids' Schedule on still paid for every family Task.
		const kidsOnly = visibilityFor({ showDailyVerse: true, hiddenDashboardModules: ['board'] });
		expect(kidsOnly.needs('kidsAttendance')).toBe(true);
		expect(kidsOnly.needs('familyRoster')).toBe(true);
		expect(kidsOnly.needs('familyTasks')).toBe(false);
	});

	it('the vocabulary is total: no read is unclaimed, no module claims nothing', () => {
		// Every read in the type is behind at least one canonical module, so
		// needs() can never be asked about a read nothing on screen wants…
		const claimed = new Set(Object.values(DASHBOARD_READS).flat());
		expect([...claimed].sort()).toEqual(READS.map(({ read }) => read).sort());
		// …and a module nothing loads declares no reads, rather than borrowing
		// one it does not consume.
		for (const id of DASHBOARD_MODULES.map((m) => m.id)) {
			expect(isDashboardModule(id)).toBe(true);
		}
		expect(DASHBOARD_READS.meals).toEqual([]);
		expect(DASHBOARD_READS.top3).toEqual([]);
		expect(DASHBOARD_READS.completed).toEqual([]);
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
		const stale = visibilityFor(savedStripHidden);
		expect(stale.modules).toEqual(visibilityFor(savedVerseOn).modules);
		expect(Object.keys(stale.modules)).not.toContain('memberStrip');
	});

	it('that stale id leaves the verse exactly as it found it', () => {
		expect(visibilityFor(savedStripHidden).modules.verse).toBe(true);
		expect(
			visibilityFor({ ...savedStripHidden, hiddenDashboardModules: ['memberStrip', 'verse'] }).modules.verse
		).toBe(false);
	});
});