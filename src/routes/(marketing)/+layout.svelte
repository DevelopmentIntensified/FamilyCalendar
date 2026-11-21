<!--
	The `(marketing)` group: marketing's shell renders the page, and marketing's own HEADER is the chrome (the legacy navbar). `MarketingShell.svelte` is imported directly, not through `ui/index.ts`: that barrel re-exports every marketing screen, so importing it here put their code (and luxon) in every page's first paint (ADR 0010).
-->
<script lang="ts">
	import { building } from '$app/environment';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import { AlertsBell } from '$lib/domains/alerts/ui';
	import MarketingHeader from '$lib/domains/marketing/ui/MarketingHeader.svelte';
	import MarketingShell from '$lib/domains/marketing/ui/MarketingShell.svelte';
	import { shellNavItems } from '$lib/screens/shell';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();
	const appNavItems = shellNavItems.filter((item) => !item.bellInstead);
</script>

<MarketingShell {data}>
	{#snippet nav()}
		{#snippet bell()}<AlertsBell navigate={goto} />{/snippet}
		<MarketingHeader pathname={data.pathname} search={building ? '' : page.url.search} isLoggedIn={data.isLoggedIn} user={data.user} {appNavItems} {bell} />
	{/snippet}
	{@render children()}
</MarketingShell>
