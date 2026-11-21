<!--
	TRANSITION BRIDGE (dashboardModules S8, 2026-11-21).

	The unported family-hub page still imports this legacy path, and a
	`+page.svelte` that imports ported code must be wiring-only (rule R8). This
	wrapper keeps the page's prop contract (`onSubmit` is still the enhance
	factory it passes) and hands everything to the module's real component
	`$lib/domains/dashboardModules/ui`. Delete it with the family page's rebuild
	(screen `familyHub`, S8).
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { DashboardModuleRow as ModuleRow } from '$lib/domains/dashboardModules/ui';
	import type {
		ModuleRowState,
		ModuleScope,
		ModuleToggleValue
	} from '$lib/domains/dashboardModules';

	type SubmitCallback = SubmitFunction;

	/** Dashboard Module label, e.g. "Family Task Board". */
	export let label: string;
	export let scope: ModuleScope;
	export let state: ModuleRowState;
	export let submitValue: ModuleToggleValue;
	export let moduleId: string;
	export let action = '?/toggleDashboardModule';
	export let pending = false;
	export let optimistic: ModuleRowState | null = null;
	export let onAcknowledge: (() => void) | null = null;
	export let onSubmit: () => SubmitCallback = () => () => {};
</script>

<ModuleRow
	{label}
	{scope}
	{state}
	{submitValue}
	{moduleId}
	{action}
	{pending}
	{optimistic}
	{onAcknowledge}
	{enhance}
	onSubmit={onSubmit()}
/>
