/**
 * Pure visibility rules: one viewer's composed answer, the verse's two
 * persisted facts, and the reads a loader may skip. Expected values come from
 * the rule (README Invariants) and the legacy pure tests it cites, never from
 * running the code.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { DASHBOARD_MODULES, type DashboardModuleId } from './dashboardModules.registry.rules';
import { dashboardVisibility, type DashboardRead } from './dashboardModules.visibility.rules';

const ALL_IDS = DASHBOARD_MODULES.map(({ id }) => id);

/** A persisted settings row, shaped the way the identity settings read returns
 * it. Not a default — these rows already exist in the wild, and every rule
 * below has to leave each one meaning the same thing. */
type SavedSettings = { showDailyVerse: boolean; hiddenDashboardModules: string[] | null };

/** Verse on, never touched the module list. */
const savedVerseOn: SavedSettings = { showDailyVerse: true, hiddenDashboardModules: [] };

/** Verse on, and its module hidden for themself before the 080 move. */
const savedVerseHidden: SavedSettings = {
	showDailyVerse: true,
	hiddenDashboardModules: ['verse', 'board']
};

/** Verse never switched on at all. */
const savedVerseOff: SavedSettings = { showDailyVerse: false, hiddenDashboardModules: [] };

/** Hid the Member Strip for themself, back when it was still a module. */
const savedStripHidden: SavedSettings = {
	showDailyVerse: true,
	hiddenDashboardModules: ['memberStrip']
};

/** One loader's answer, composed from a saved row and the family switches. */
function visibilityFor(
	settings: SavedSettings | null,
	familySwitches: Record<string, boolean> = {}
) {
	return dashboardVisibility({ settings, familySwitches });
}

describe('dashboardVisibility — module id × persisted fact (109)', () => {
	/** Every module, against every persisted fact that can move it. The
	 * "one fact says hide, the other says show" rows are the ones the live bug
	 * lived in: the calendar loader read the setting and never the list. */
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
			visible: ALL_IDS,
			hidden: []
		},
		{
			what: 'the verse hidden for themself while its setting stays on — the reported bug',
			settings: savedVerseHidden,
			visible: ['glance', 'top3', 'completed', 'kids', 'groceries', 'meals'],
			hidden: ['verse', 'board']
		},
		{
			what: 'a null hidden list is not a hidden module',
			settings: { showDailyVerse: true, hiddenDashboardModules: null },
			visible: ALL_IDS,
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
			visible: ALL_IDS,
			hidden: []
		}
	];

	// Legacy table, src/lib/dashboardModules.test.ts:119-200.
	it.each(CASES)('$what', ({ settings, familySwitches, visible, hidden }) => {
		const { modules } = visibilityFor(settings, familySwitches);
		expect(
			Object.entries(modules)
				.filter(([, on]) => on)
				.map(([id]) => id)
				.sort()
		).toEqual([...visible].sort());
		expect(
			Object.entries(modules)
				.filter(([, on]) => !on)
				.map(([id]) => id)
				.sort()
		).toEqual([...hidden].sort());
	});

	// Legacy case, src/lib/dashboardModules.test.ts:202.
	it.each(DASHBOARD_MODULES)('shows() and the map agree on $id', ({ id }) => {
		const { modules, shows } = visibilityFor(savedVerseHidden);
		expect(shows(id)).toBe(modules[id]);
	});

	// Legacy case, src/lib/dashboardModules.test.ts:207.
	it('every canonical id is present in the map, so a payload needs no defaulting', () => {
		expect(Object.keys(visibilityFor(savedVerseOn).modules).sort()).toEqual([...ALL_IDS].sort());
	});

	it('composes the family switch and the hidden list into one total map', () => {
		const { modules } = visibilityFor(savedVerseHidden, { board: false });
		expect(modules).toEqual({
			verse: false,
			glance: true,
			top3: true,
			completed: true,
			board: false,
			kids: true,
			groceries: true,
			meals: true
		});
		expect(Object.keys(modules).sort()).toEqual([...ALL_IDS].sort());
	});

	it('a family-off switch wins over any user preference', () => {
		// Showing it for yourself cannot light it up…
		expect(visibilityFor(savedVerseOn, { board: false }).modules.board).toBe(false);
		// …and hiding it too does not change the answer.
		expect(
			visibilityFor({ showDailyVerse: true, hiddenDashboardModules: ['board'] }, { board: false })
				.modules.board
		).toBe(false);
	});

	// Legacy case, src/lib/dashboardModules.test.ts:212.
	it('a family switch for an id that is not canonical changes nothing', () => {
		const { modules } = visibilityFor(savedVerseOn, { memberStrip: false, widget: false });
		expect(Object.keys(modules)).not.toContain('memberStrip');
		expect(Object.keys(modules)).not.toContain('widget');
		expect(modules).toEqual(visibilityFor(savedVerseOn).modules);
	});

	// Legacy case, src/lib/server/db/actions/dashboardModules.test.ts:116.
	it('ignores unknown entries in the hidden list', () => {
		const { modules } = visibilityFor({
			showDailyVerse: true,
			hiddenDashboardModules: ['widget', 'nope']
		});
		expect(modules).toEqual(visibilityFor(savedVerseOn).modules);
		expect(Object.keys(modules)).not.toContain('widget');
	});

	// Legacy case, src/lib/server/db/actions/dashboardModules.test.ts:158: a
	// retired id is dropped, not honoured, and does not disturb its neighbours.
	it('a hidden list naming a retired id and a live one hides only the live one', () => {
		const { modules } = visibilityFor({
			showDailyVerse: true,
			hiddenDashboardModules: ['memberStrip', 'board']
		});
		expect(modules).toEqual({ ...visibilityFor(savedVerseOn).modules, board: false });
		expect(Object.keys(modules)).not.toContain('memberStrip');
	});

	// Legacy cases, src/lib/server/db/actions/dashboardModules.test.ts:74-130.
	it('kids and meals respect their family master switch', () => {
		const { modules } = visibilityFor(savedVerseOn, { kids: false, meals: false });
		expect(modules.kids).toBe(false);
		expect(modules.meals).toBe(false);
		expect(modules.board).toBe(true);
	});

	it('a per-user hidden module is hidden even when its family switch is on', () => {
		const { modules } = visibilityFor(
			{ showDailyVerse: true, hiddenDashboardModules: ['top3', 'kids'] },
			{ top3: true, kids: true, board: true, groceries: true, meals: true }
		);
		expect(modules.top3).toBe(false);
		expect(modules.kids).toBe(false);
		expect(modules.board).toBe(true);
	});

	// Legacy case, src/lib/server/db/actions/dashboardModules.test.ts:109: with the
	// family switch ON, the viewer's own hide still holds.
	it('a viewer hide holds even while the family switch is on', () => {
		const { modules } = visibilityFor(
			{ showDailyVerse: true, hiddenDashboardModules: ['board'] },
			{ board: true }
		);
		expect(modules.board).toBe(false);
	});

	// Legacy cases, src/lib/server/db/actions/dashboardModules.test.ts:122-155.
	it('completed is personal: the family switch is ignored, the viewer hide honoured', () => {
		expect(visibilityFor(savedVerseOn, { completed: false }).modules.completed).toBe(true);
		expect(
			visibilityFor({ showDailyVerse: true, hiddenDashboardModules: ['completed'] }).modules.completed
		).toBe(false);
	});

	it('groceries is family-scoped and each member can still hide it alone', () => {
		expect(visibilityFor(savedVerseOn).modules.groceries).toBe(true);
		expect(visibilityFor(savedVerseOn, { groceries: false }).modules.groceries).toBe(false);
		expect(
			visibilityFor(
				{ showDailyVerse: true, hiddenDashboardModules: ['groceries'] },
				{ groceries: true }
			).modules.groceries
		).toBe(false);
	});
});

describe('the verse reads BOTH persisted facts (080/109)', () => {
	// Legacy cases, src/lib/dashboardModules.test.ts:237-267.
	it('a user who hid the verse before the move stays hidden', () => {
		expect(visibilityFor(savedVerseHidden).modules.verse).toBe(false);
	});

	it('a user who never hid it sees it as before', () => {
		expect(visibilityFor(savedVerseOn).modules.verse).toBe(true);
	});

	it('verse off in settings stays off, whatever the hidden list says', () => {
		expect(visibilityFor(savedVerseOff).modules.verse).toBe(false);
		expect(
			visibilityFor({ ...savedVerseOff, hiddenDashboardModules: null }).modules.verse
		).toBe(false);
	});

	it('hiding another card never hides the verse', () => {
		expect(
			visibilityFor({ ...savedVerseOn, hiddenDashboardModules: ['board', 'kids'] }).modules.verse
		).toBe(true);
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
	/** read × the modules that consume it. */
	const READS: Array<{ read: DashboardRead; consumers: DashboardModuleId[] }> = [
		{ read: 'verse', consumers: ['verse'] },
		{ read: 'familyTasks', consumers: ['board'] },
		{ read: 'familyRoster', consumers: ['board', 'kids'] },
		{ read: 'familyDayEvents', consumers: ['glance', 'kids'] },
		{ read: 'kidsAttendance', consumers: ['kids'] },
		{ read: 'groceries', consumers: ['groceries'] }
	];

	// Legacy case, src/lib/dashboardModules.test.ts:280.
	it('an untouched account pays for every read', () => {
		const { needs } = visibilityFor(savedVerseOn);
		for (const { read } of READS) expect(needs(read)).toBe(true);
	});

	// Legacy case, src/lib/dashboardModules.test.ts:285.
	it.each(READS)('$read is needed while any of its consumers is visible', ({ read, consumers }) => {
		for (const consumer of consumers) {
			// Hide every OTHER consumer; this one alone must keep the read.
			const others = consumers.filter((candidate) => candidate !== consumer);
			const visibility = visibilityFor({
				showDailyVerse: true,
				hiddenDashboardModules: others
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

	it('every read is skipped when every module is hidden', () => {
		const { needs } = visibilityFor(
			{ showDailyVerse: true, hiddenDashboardModules: ALL_IDS },
			{ board: false, kids: false, groceries: false, meals: false }
		);
		for (const { read } of READS) expect(needs(read)).toBe(false);
	});

	it('needs() follows the visible consumers, not the module count', () => {
		// One hidden card retires only the reads nothing else on screen wants.
		const withoutBoard = visibilityFor(savedVerseOn, { board: false });
		expect(withoutBoard.needs('familyTasks')).toBe(false);
		expect(withoutBoard.needs('familyRoster')).toBe(true);
		expect(withoutBoard.needs('familyDayEvents')).toBe(true);
		// Kids' Schedule alone keeps the roster and attendance, never the board.
		const withoutBoardOrGlance = visibilityFor({
			showDailyVerse: true,
			hiddenDashboardModules: ['board', 'glance']
		});
		expect(withoutBoardOrGlance.needs('kidsAttendance')).toBe(true);
		expect(withoutBoardOrGlance.needs('familyDayEvents')).toBe(true);
		expect(withoutBoardOrGlance.needs('groceries')).toBe(true);
	});

	// Legacy case, src/lib/dashboardModules.test.ts:303.
	it('a family master switch off can retire a read on its own', () => {
		expect(visibilityFor(savedVerseOn, { board: false }).needs('familyTasks')).toBe(false);
		// …but the roster is still wanted by Kids' Schedule.
		expect(visibilityFor(savedVerseOn, { board: false }).needs('familyRoster')).toBe(true);
	});

	// Legacy case, src/lib/dashboardModules.test.ts:310.
	it("Kids' Schedule alone does not buy the whole family task board", () => {
		const kidsOnly = visibilityFor({ showDailyVerse: true, hiddenDashboardModules: ['board'] });
		expect(kidsOnly.needs('kidsAttendance')).toBe(true);
		expect(kidsOnly.needs('familyRoster')).toBe(true);
		expect(kidsOnly.needs('familyTasks')).toBe(false);
	});

	// Legacy case, src/lib/dashboardModules.test.ts:319 asserted
	// `DASHBOARD_READS.meals`/`top3`/`completed` were empty. The table is
	// private now, so the observable equivalent: with only that module on
	// screen, no read is paid for.
	it.each<[DashboardModuleId]>([['meals'], ['top3'], ['completed']])(
		'%s declares no skippable read',
		(onlyVisible) => {
			const hidden = ALL_IDS.filter((id) => id !== onlyVisible);
			const { modules, needs } = visibilityFor({
				showDailyVerse: false,
				hiddenDashboardModules: hidden
			});
			expect(modules[onlyVisible]).toBe(true);
			for (const { read } of READS) expect(needs(read)).toBe(false);
		}
	);
});

describe('the Member strip is no longer a Dashboard Module (103)', () => {
	// Legacy cases, src/lib/dashboardModules.test.ts:335-364 and
	// src/lib/server/db/actions/dashboardModules.test.ts:157-186.
	it('a saved hidden list still naming it composes to a clean map', () => {
		const stale = visibilityFor(savedStripHidden);
		expect(stale.modules).toEqual(visibilityFor(savedVerseOn).modules);
		expect(Object.keys(stale.modules)).not.toContain('memberStrip');
	});

	it('that stale id leaves the verse exactly as it found it', () => {
		expect(visibilityFor(savedStripHidden).modules.verse).toBe(true);
		expect(
			visibilityFor({ ...savedStripHidden, hiddenDashboardModules: ['memberStrip', 'verse'] }).modules
				.verse
		).toBe(false);
	});

	it('a stale family master-switch row is inert, not fatal', () => {
		const stale = visibilityFor(savedVerseOn, { memberStrip: false });
		expect(stale.modules).toEqual(visibilityFor(savedVerseOn).modules);
		expect(Object.keys(stale.modules)).not.toContain('memberStrip');
	});
});
