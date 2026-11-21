<!--
	The account group: the app chrome and the legacy content column. The
	`flex-grow` wrapper is the legacy `(calendar)/account/+layout.svelte` div —
	a page's `mx-auto max-w-md` block must be a block child of a block, or its
	auto margins shrink it to its text width as a flex item.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { createShellPorts } from '$lib/screens/shell';
	import { ShellRoot } from '$lib/screens/shell/ui';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	const ports = createShellPorts();
</script>

<ShellRoot {page} user={data.user} {ports} navigate={goto}>
	<div class="flex-grow pb-20 md:pb-0 print:pb-0">
		{@render children()}
	</div>
</ShellRoot>
