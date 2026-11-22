<!--
	The family group's frame: the app chrome, then the calendar's measured banner
	stack without the app footer; no load of its own (the root load requires a session).
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import AlertsBell from '$lib/domains/alerts/ui/AlertsBell.svelte';
	import { createShellPorts } from '$lib/screens/shell';
	import { ShellGroupFrame, ShellRoot } from '$lib/screens/shell/ui';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	const ports = createShellPorts();
</script>

{#snippet bell()}<AlertsBell navigate={goto} />{/snippet}
<ShellRoot {page} user={data.user} {ports} {bell}>
	{#if data.user}
		<ShellGroupFrame variant="family" scope={{ user: data.user, year: data.year }} {ports}>
			{@render children()}
		</ShellGroupFrame>
	{:else}
		{@render children()}
	{/if}
</ShellRoot>
