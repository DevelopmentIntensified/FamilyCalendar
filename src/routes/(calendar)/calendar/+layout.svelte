<!--
	The calendar group: the app chrome and the measured group frame; the chrome
	lives in the group layouts, so a page with its own frame never ships it (ADR 0010).
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { goto, invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import AlertsBell from '$lib/domains/alerts/ui/AlertsBell.svelte';
	import { createShellPorts } from '$lib/screens/shell';
	import ShellGroupFrame from '$lib/screens/shell/ui/ShellGroupFrame.svelte'; // file, never `../ui` (see README)
	import ShellRoot from '$lib/screens/shell/ui/ShellRoot.svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	const ports = createShellPorts();
	// The scope's own dependency: a zone save or a verify re-reads the group, not the world.
	const refresh = (): void => void invalidate('shell:scope');
</script>

{#snippet bell()}<AlertsBell navigate={goto} />{/snippet}
<ShellRoot {page} user={data.user} {ports} {bell}>
	<ShellGroupFrame variant="calendar" scope={data} search={page.url.search} {ports} {refresh}>
		{@render children()}
	</ShellGroupFrame>
</ShellRoot>
