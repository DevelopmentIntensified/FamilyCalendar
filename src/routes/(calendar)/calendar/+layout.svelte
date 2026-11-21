<script lang="ts">
	import type { Snippet } from 'svelte';
	import { invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import { createShellPorts } from '$lib/screens/shell';
	import { ShellGroupFrame } from '$lib/screens/shell/ui';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	const ports = createShellPorts();
	// The scope's own dependency: a zone save or a verify re-reads the group, not the world.
	const refresh = (): void => void invalidate('shell:scope');
</script>

<ShellGroupFrame variant="calendar" scope={data} search={page.url.search} {ports} {refresh}>
	{@render children()}
</ShellGroupFrame>
