<!--
	The `(marketing)` group: the module's shell renders the page, and the NAVBAR
	and TOASTER are the shell module's chrome (not ported yet), handed in as
	snippets — rule R1's seam. When shell lands, only this file changes.
-->
<script lang="ts">
	import Navbar from '$lib/components/Navbar.svelte';
	import Toaster from '$lib/components/Toaster.svelte';
	// The shell component itself, not the module's `ui/index.ts`: that barrel
	// re-exports all seventeen marketing screens, so importing it here put their
	// code (and luxon, through the changelog formatter) in every marketing page's
	// first paint. Every page under this group pays for this file (ADR 0010).
	import MarketingShell from '$lib/domains/marketing/ui/MarketingShell.svelte';
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();
</script>

<MarketingShell {data}>
	{#snippet nav()}<Navbar isLoggedIn={data.isLoggedIn} user={data.user} />{/snippet}
	{#snippet toaster()}<Toaster />{/snippet}
	{@render children()}
</MarketingShell>
