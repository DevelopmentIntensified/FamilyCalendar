/**
 * dashboardModules visibility rules: the one composition that answers "is this
 * module visible to this viewer, and which expensive read may the loader
 * skip?".
 *
 * Family master switch (family-scoped modules only) AND the viewer's own
 * hidden list both apply. Personal modules are only ever gated by the hidden
 * list. The Daily Verse additionally reads the calendar's own `showDailyVerse`
 * setting — the one module whose visibility is a function of a second
 * persisted fact, which is why `settings` arrives as one object: the two facts
 * come together or not at all.
 *
 * Pure. It touches no database and reads no clock, so the same answer serves a
 * loader, a page payload and a component.
 *
 * Doc: ./README.md#invariants
 */
import {
	DASHBOARD_MODULES,
	isDashboardModule,
	showsModule,
	type DashboardModuleId,
	type ModuleSwitchMap
} from './dashboardModules.registry.rules';

/** An expensive read a module justifies paying for (109). */
export type DashboardRead =
	| 'verse'
	| 'familyTasks'
	| 'familyRoster'
	| 'familyDayEvents'
	| 'kidsAttendance'
	| 'groceries';

/** Which reads each module consumes. One entry per read; `needs()` is its only
 * reader, so the table stays private rather than freezing a vocabulary nobody
 * else may read. */
const DASHBOARD_READS: Record<DashboardModuleId, readonly DashboardRead[]> = {
	// The verse has a persisted fact of its own (showDailyVerse) on top of the
	// composition — see dashboardVisibility.
	verse: ['verse'],
	// Day at a Glance lists family events alongside the viewer's own.
	glance: ['familyDayEvents'],
	// Top 3 ranks the viewer's own tasks; Completed Today counts them. Both
	// consume the always-fetched user tasks, so neither declares a skippable
	// read.
	top3: [],
	completed: [],
	// The board lists every open family task, grouped by assignee — which takes
	// the family roster as well.
	board: ['familyTasks', 'familyRoster'],
	// Kids' Schedule is the family's day events filtered to child attendees, so
	// it wants the roster and the attendance rows, not the whole task board.
	kids: ['familyDayEvents', 'familyRoster', 'kidsAttendance'],
	groceries: ['groceries'],
	// The meal plan is not loaded by the dashboard yet.
	meals: []
};

/** The two facts a viewer contributes from their settings row. */
export type DashboardSettingsFacts = {
	readonly showDailyVerse?: boolean | null;
	readonly hiddenDashboardModules?: readonly string[] | null;
};

/** What a loader, a page, or a component needs to know about one viewer. */
export interface DashboardVisibility {
	/** Canonical module id → visible to this viewer. Every id is present, so a
	 * payload can carry this map to a component verbatim. */
	readonly modules: Record<DashboardModuleId, boolean>;
	/** Is this module visible to this viewer? */
	shows(id: string): boolean;
	/** Can the loader skip this read? True while some visible module still
	 * consumes it. */
	needs(read: DashboardRead): boolean;
}

/** The viewer's effective module visibility, composed once (109). */
export function dashboardVisibility(input: {
	/** The settings row, or the two facts off it. Absent = nothing saved. */
	settings?: DashboardSettingsFacts | null;
	/** Current family master switches. Absent = every family module enabled. */
	familySwitches?: ModuleSwitchMap;
}): DashboardVisibility {
	const switches = input.familySwitches ?? {};
	const hidden = new Set((input.settings?.hiddenDashboardModules ?? []).filter(isDashboardModule));
	const showsForViewer = (id: DashboardModuleId): boolean => {
		const master =
			DASHBOARD_MODULES.find((module) => module.id === id)?.scope === 'family'
				? (switches[id] ?? true)
				: true;
		return master && !hidden.has(id);
	};
	// SAFETY: every canonical id is a key here by construction, which
	// Object.fromEntries' index signature cannot prove.
	const modules = Object.fromEntries(
		DASHBOARD_MODULES.map(({ id }) => [
			id,
			// The verse's second fact is its own settings field, not a module
			// switch, and it only ever removes visibility (080).
			showsForViewer(id) && (id !== 'verse' || input.settings?.showDailyVerse === true)
		])
	) as Record<DashboardModuleId, boolean>;
	return {
		modules,
		shows: (id: string) => showsModule(modules, id),
		needs: (read: DashboardRead) =>
			DASHBOARD_MODULES.some(({ id }) => modules[id] && DASHBOARD_READS[id].includes(read))
	};
}
