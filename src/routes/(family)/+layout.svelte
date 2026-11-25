<!--
	The family group's frame: chrome, then the measured banner stack without the app footer; no load of its own.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import AlertsBell from '$lib/domains/alerts/ui/AlertsBell.svelte';
	import { createShellPorts } from '$lib/screens/shell';
	import ShellGroupFrame from '$lib/screens/shell/ui/ShellGroupFrame.svelte'; // file, never `../ui` (see README)
	import ShellRoot from '$lib/screens/shell/ui/ShellRoot.svelte';
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
