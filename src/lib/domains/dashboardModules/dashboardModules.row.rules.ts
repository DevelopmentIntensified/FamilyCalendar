/**
 * dashboardModules row rules: how one family-hub switch row reads and what its
 * toggle submits. A row collapses (scope, family switch, viewer hide) into
 * exactly one state, and the labels and tone follow from that state — one
 * answer, so the component never composes two booleans itself.
 *
 * Doc: ./README.md#invariants
 */
import type { ModuleScope } from './dashboardModules.registry.rules';

/** The three states a module row can read.
 *
 * - `on`            — the family switch is on and the viewer has not hidden it.
 * - `off`           — family master switch off; hidden for everyone.
 * - `hidden-for-me` — family switch on, but the viewer hid it for themself.
 */
export type ModuleRowState = 'on' | 'off' | 'hidden-for-me';

/** `true`/`false` is what the form submits, so the row never builds the string. */
export type ModuleToggleValue = 'true' | 'false';

/** Everything one row needs to render. */
export type DashboardModuleRowInfo = {
	readonly state: ModuleRowState;
	readonly scopeLabel: string;
	readonly stateLabel: string;
	readonly stateClass: string;
	readonly submitValue: ModuleToggleValue;
};

/** Scope chip text — the vocabulary the issue asks for. */
const SCOPE_LABEL: Record<ModuleScope, string> = {
	personal: 'Personal',
	family: 'Family-wide'
};

/** State chip text, read together with the label and the scope chip. */
const STATE_LABEL: Record<ModuleRowState, string> = {
	on: 'On',
	off: 'Off',
	'hidden-for-me': 'Hidden for you'
};

/** State chip tone. Distinct per state so the row never reads ambiguously. */
const STATE_CLASS: Record<ModuleRowState, string> = {
	on: 'bg-emerald-100 text-emerald-700',
	off: 'bg-slate-200 text-slate-500',
	'hidden-for-me': 'bg-amber-100 text-amber-700'
};

/**
 * One row's whole story. Family-off outranks the viewer's preference: the
 * master switch is the louder fact, and a row must never say two things at
 * once. Otherwise a family module the viewer hid reads `hidden-for-me`; a
 * personal module has no family switch, so a stale hidden-list entry cannot
 * downgrade it (legacy `moduleRowState`, ported exactly — the personal branch
 * is unreachable from today's callers, and whether it should ever read
 * `hidden-for-me` is an S7 design question).
 *
 * The submit value is the opposite of the current family switch: it flips the
 * row away from where it is now.
 */
export function describeDashboardModuleRow(input: {
	readonly scope: ModuleScope;
	readonly enabled: boolean;
	readonly hiddenForViewer: boolean;
}): DashboardModuleRowInfo {
	const state: ModuleRowState = !input.enabled
		? 'off'
		: input.scope === 'family' && input.hiddenForViewer
			? 'hidden-for-me'
			: 'on';
	return {
		state,
		scopeLabel: SCOPE_LABEL[input.scope],
		stateLabel: STATE_LABEL[state],
		stateClass: STATE_CLASS[state],
		submitValue: input.enabled ? 'false' : 'true'
	};
}
