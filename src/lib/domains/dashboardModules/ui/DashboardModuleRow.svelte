<!--
	One Dashboard Module switch row for the family hub's settings band: the
	label, a scope chip and the state chip. Legacy
	`src/lib/components/dashboard/DashboardModuleRow.svelte` is the reference for
	the markup; rebuilt in Svelte 5 with props in and callbacks out (no
	`$app/*` in the component — the route passes the framework's `enhance`
	action in, and the default no-op action leaves the plain form alone).

	The row holds no state of its own: the caller owns the flip, the optimistic
	override and the acknowledge timing. What a switch *means* lives in
	`describeDashboardModuleRow`; the chips' words and tones come from the same
	place through `describeDashboardModuleState`, so an optimistic state gets
	the same vocabulary.

	The chips stay plain spans rather than `Pill` because the tones are the row
	rules' `stateClass` (the off chip is slate-200/500, which Pill's neutral
	tone is not): one tone table, and no chip that reads differently from the
	rule that produced it.

	Doc: ../README.md#public-interface
-->
<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { ModuleScope } from '../dashboardModules.registry.rules';
	import {
		describeDashboardModuleState,
		type ModuleRowState,
		type ModuleToggleValue
	} from '../dashboardModules.row.rules';

	/**
	 * The `$app/forms` `enhance` action, structurally: node in, action out. The
	 * route passes the real one, so this component never imports `$app/*`.
	 */
	type DashboardModuleFormEnhancer = (
		node: HTMLFormElement,
		submit: SubmitFunction
	) => { destroy(): void };

	/** A no-op action: no `preventDefault`, so a plain form still submits. */
	const plainForm: DashboardModuleFormEnhancer = () => ({ destroy: () => {} });

	interface Props {
		/** Dashboard Module label, e.g. "Family Task Board". */
		label: string;
		scope: ModuleScope;
		/**
		 * The row's single state. The row renders it and nothing more — what a
		 * module switch *means* lives in the caller and in the row rules.
		 */
		state: ModuleRowState;
		/** Value the submit button posts; the caller owns the flip semantics. */
		submitValue: ModuleToggleValue;
		moduleId: string;
		action?: string;
		/** In-flight flip: dimmed, still readable, still clickable. */
		pending?: boolean;
		/**
		 * Optimistic override shown until the server answers; `null` shows
		 * `state`. The owner flips it on click (<100ms ack) and clears it on the
		 * result — the row itself holds no state.
		 */
		optimistic?: ModuleRowState | null;
		/**
		 * Fired on click, before the request leaves — the owner's <100ms ack
		 * hook. The row reports that it was activated; what the row should then
		 * look like is the owner's call (it hands the answer back via
		 * `optimistic`).
		 */
		onAcknowledge?: (() => void) | null;
		/** The framework's `enhance` action, passed in by the route. */
		enhance?: DashboardModuleFormEnhancer;
		/** The enhance submit callback built by the caller. */
		onSubmit?: SubmitFunction;
	}

	let {
		label,
		scope,
		state,
		submitValue,
		moduleId,
		action = '?/toggleDashboardModule',
		pending = false,
		optimistic = null,
		onAcknowledge = null,
		enhance = plainForm,
		onSubmit = () => {}
	}: Props = $props();

	const shown = $derived(optimistic ?? state);
	const chips = $derived(describeDashboardModuleState(scope, shown));
</script>

<form method="POST" {action} use:enhance={onSubmit}>
	<input type="hidden" name="module" value={moduleId} />
	<button
		type="submit"
		name="enabled"
		value={submitValue}
		onclick={() => onAcknowledge?.()}
		aria-pressed={shown === 'on'}
		aria-busy={pending}
		class="flex w-full min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-left transition-colors hover:border-slate-300 hover:bg-slate-50 {pending
			? 'opacity-70'
			: ''}"
	>
		<span class="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{label}</span>
		<span
			class="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500"
			>{chips.scopeLabel}</span
		>
		<span
			class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold {chips.stateClass}"
			>{chips.stateLabel}</span
		>
	</button>
</form>
