<!--
	The `(marketing)` group: the module's shell renders the page, and the NAVBAR
	and TOASTER are the shell module's chrome (not ported yet), handed in as
	snippets — rule R1's seam. When shell lands, only this file changes.
-->
<script lang="ts">
	import Navbar from '$lib/components/Navbar.svelte';
	import Toaster from '$lib/components/Toaster.svelte';
	import { MarketingShell } from '$lib/domains/marketing/ui';
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();
</script>

<MarketingShell {data}>
	{#snippet nav()}<Navbar isLoggedIn={data.isLoggedIn} user={data.user} />{/snippet}
	{#snippet toaster()}<Toaster />{/snippet}
	{@render children()}
</MarketingShell>
