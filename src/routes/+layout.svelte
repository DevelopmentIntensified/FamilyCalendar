<script lang="ts">
	import '../app.css';
	import type { Snippet } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { createShellPorts } from '$lib/screens/shell';
	import { ShellRoot } from '$lib/screens/shell/ui';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	const ports = createShellPorts();
</script>

<ShellRoot
	routeId={page.route.id}
	pathname={page.url.pathname}
	search={page.url.search}
	user={data.user}
	{ports}
	navigate={goto}
>
	{@render children()}
</ShellRoot>
