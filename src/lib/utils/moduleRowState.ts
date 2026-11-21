/**
 * TRANSITION BRIDGE (dashboardModules S8, 2026-11-21).
 *
 * The unported family-hub page and its row component still import these two
 * names; the rules themselves now live in `$lib/domains/dashboardModules`
 * (`describeDashboardModuleRow`, `dashboardModuleToggleValue`). One home, two
 * legacy names, until the page's rebuild (screen `familyHub`, S8) moves it to
 * the module's entry and this file goes.
 */
import {
	dashboardModuleToggleValue,
	describeDashboardModuleRow,
	type ModuleRowState
} from '$lib/domains/dashboardModules';

export type { ModuleRowState };

/** Collapse (scope, family switch, viewer hide) into one row state. */
export function moduleRowState(input: {
	scope: 'personal' | 'family';
	enabled: boolean;
	hiddenForViewer: boolean;
}): ModuleRowState {
	return describeDashboardModuleRow(input).state;
}

/** Form value that flips the family master switch away from its current position. */
export function moduleToggleValue(enabled: boolean): 'true' | 'false' {
	return dashboardModuleToggleValue(enabled);
}
