<script lang="ts">
	/**
	 * The family group's frame: the same chrome and the same measured banner
	 * stack as the calendar, without the app footer — and with no load of its
	 * own, because the root load's app-chrome guard already requires a session.
	 */
	import type { Snippet } from 'svelte';
	import { createShellPorts } from '$lib/screens/shell';
	import { ShellGroupFrame } from '$lib/screens/shell/ui';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	const ports = createShellPorts();
</script>

{#if data.user}
	{@const user = data.user}
	<ShellGroupFrame variant="family" scope={{ user, year: data.year }} {ports}>
		{@render children()}
	</ShellGroupFrame>
{:else}
	{@render children()}
{/if}
