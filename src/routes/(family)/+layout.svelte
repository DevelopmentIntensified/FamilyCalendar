<!--
	The family group's frame: the app chrome, then the same measured banner
	stack as the calendar without the app footer — and with no load of its own,
	because the root load's app-chrome guard already requires a session.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { createShellPorts } from '$lib/screens/shell';
	import { ShellGroupFrame, ShellRoot } from '$lib/screens/shell/ui';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	const ports = createShellPorts();
</script>

<ShellRoot {page} user={data.user} {ports} navigate={goto}>
	{#if data.user}
		<ShellGroupFrame variant="family" scope={{ user: data.user, year: data.year }} {ports}>
			{@render children()}
		</ShellGroupFrame>
	{:else}
		{@render children()}
	{/if}
</ShellRoot>
