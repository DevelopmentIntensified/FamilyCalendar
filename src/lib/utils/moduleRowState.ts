import { DASHBOARD_MODULES } from '$lib/dashboardModules';

/** Scope of a Dashboard Module — 'personal' modules are only ever hidden by
 * their own user; 'family' modules also carry a family master switch. */
export type ModuleScope = (typeof DASHBOARD_MODULES)[number]['scope'];

/** The three states a Dashboard Module row can read.
 *
 * - `on`            — on for everyone.
 * - `off`           — family master switch off; hidden for everyone.
 * - `hidden-for-me` — master switch on, but the viewer hid it for themself.
 */
export type ModuleRowState = 'on' | 'off' | 'hidden-for-me';

/** Collapse (scope, family switch, viewer hide) into one row state.
 *
 * Family-off outranks hidden-for-me: the master switch is the louder fact, and
 * a row must never say two things at once.
 */
export function moduleRowState(input: {
	scope: ModuleScope;
	enabled: boolean;
	hiddenForViewer: boolean;
}): ModuleRowState {
	if (!input.enabled) return 'off';
	if (input.scope === 'family' && input.hiddenForViewer) return 'hidden-for-me';
	return 'on';
}

/** Scope chip text — the vocabulary the issue asks for. */
export function moduleScopeLabel(scope: ModuleScope): string {
	return scope === 'family' ? 'Family-wide' : 'Personal';
}

/** State chip text, read together with the label and the scope chip. */
export function moduleStateLabel(state: ModuleRowState): string {
	return state === 'on' ? 'On' : state === 'off' ? 'Off' : 'Hidden for you';
}

/** State chip tone. Distinct per state so the row never reads ambiguously. */
export function moduleStateClass(state: ModuleRowState): string {
	return state === 'on'
		? 'bg-emerald-100 text-emerald-700'
		: state === 'off'
			? 'bg-slate-200 text-slate-500'
			: 'bg-amber-100 text-amber-700';
}

/** Form value that flips the family master switch away from its current
 * position. Lives here — not in the row markup — so a later change to what a
 * module switch *means* is a one-line edit (#080).
 */
export function moduleToggleValue(enabled: boolean): 'true' | 'false' {
	return enabled ? 'false' : 'true';
}
