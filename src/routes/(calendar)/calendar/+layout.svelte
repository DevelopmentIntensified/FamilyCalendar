<!--
	The calendar group: the app chrome (navbar, tab bar, toast host) and the
	measured group frame. The chrome lives in the group layouts, not in the root
	layout, so a page that renders its own frame (`/claim`, `/merge-guest`,
	marketing, admin) never ships it — the legacy structure (ADR 0010).
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { goto, invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import { createShellPorts } from '$lib/screens/shell';
	import { ShellGroupFrame, ShellRoot } from '$lib/screens/shell/ui';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	const ports = createShellPorts();
	// The scope's own dependency: a zone save or a verify re-reads the group, not the world.
	const refresh = (): void => void invalidate('shell:scope');
</script>

<ShellRoot {page} user={data.user} {ports} navigate={goto}>
	<ShellGroupFrame variant="calendar" scope={data} search={page.url.search} {ports} {refresh}>
		{@render children()}
	</ShellGroupFrame>
</ShellRoot>
