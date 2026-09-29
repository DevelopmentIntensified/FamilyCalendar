<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import {
		moduleScopeLabel,
		moduleStateLabel,
		moduleStateClass,
		type ModuleScope,
		type ModuleRowState
	} from '$lib/utils/moduleRowState';

	/**
	 * The enhance submit callback SvelteKit hands to the factory's return
	 * value: first the submit args, then `{ result, update }` after the action.
	 */
	type SubmitCallback = SubmitFunction<{ type: string }>;

	/** Dashboard Module label, e.g. "Family Task Board". */
	export let label: string;
	export let scope: ModuleScope;
	/**
	 * The row's single state. The row renders it and nothing more — what a
	 * module switch *means* lives in the caller and in `moduleRowState`.
	 */
	export let state: ModuleRowState;
	/** Value the submit button posts; the caller owns the flip semantics. */
	export let submitValue: string;
	export let moduleId: string;
	export let action = '?/toggleDashboardModule';
	/** In-flight flip: dimmed, still readable, still clickable. */
	export let pending = false;
	/**
	 * Optimistic override shown until the server answers; `null` shows
	 * `state`. The owner flips it on click (<100ms ack) and clears it on the
	 * result — the row itself holds no state.
	 */
	export let optimistic: ModuleRowState | null = null;
	/**
	 * Fired on click, before the request leaves — the owner's <100ms ack
	 * hook. The row reports that it was activated; what the row should then
	 * look like is the owner's call (it hands the answer back via
	 * `optimistic`).
	 */
	export let onAcknowledge: (() => void) | null = null;
	/**
	 * `enhance` submit *factory* — the same shape the rest of the family page
	 * uses: SvelteKit calls it once with the submit args and uses the returned
	 * function as the callback that later receives `{ result, update }`.
	 */
	export let onSubmit: () => SubmitCallback = () => () => {};

	$: shown = optimistic ?? state;
</script>

<form method="POST" {action} use:enhance={onSubmit()}>
	<input type="hidden" name="module" value={moduleId} />
	<button
		type="submit"
		name="enabled"
		value={submitValue}
		data-testid="module-row"
		on:click={() => onAcknowledge?.()}
		aria-pressed={shown === 'on'}
		aria-busy={pending}
		class="flex w-full min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-left transition-colors hover:border-slate-300 hover:bg-slate-50 {pending
			? 'opacity-70'
			: ''}"
	>
		<span
			data-testid="module-row-label"
			class="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{label}</span
		>
		<span
			class="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500"
			>{moduleScopeLabel(scope)}</span
		>
		<span
			data-testid="module-row-state"
			class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold {moduleStateClass(shown)}"
			>{moduleStateLabel(shown)}</span
		>
	</button>
</form>
