<!--
	The `(marketing)` group: marketing's shell renders the page, and marketing's own HEADER is the chrome (the legacy navbar). `MarketingShell.svelte` is imported directly, not through `ui/index.ts`: that barrel re-exports every marketing screen, so importing it here put their code (and luxon) in every page's first paint (ADR 0010). The bell is imported only inside its snippet: the header renders that slot only for a signed-in visitor, so a guest's page never fetches the bell, its feed rules, push probe or toaster (~25 KB raw) — one of the two reasons every marketing page was over its initial-JS ceiling.
-->
<script lang="ts">
	import { building } from '$app/environment';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import MarketingHeader from '$lib/domains/marketing/ui/MarketingHeader.svelte';
	import MarketingShell from '$lib/domains/marketing/ui/MarketingShell.svelte';
	import { shellNavItems } from '$lib/screens/shell';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();
	const appNavItems = shellNavItems.filter((item) => !item.bellInstead);
</script>

<MarketingShell {data}>
	{#snippet nav()}
		{#snippet bell()}{#await import('$lib/domains/alerts/ui/AlertsBell.svelte') then { default: AlertsBell }}<AlertsBell navigate={goto} />{/await}{/snippet}
		<MarketingHeader pathname={data.pathname} search={building ? '' : page.url.search} isLoggedIn={data.isLoggedIn} user={data.user} {appNavItems} {bell} />
	{/snippet}
	{@render children()}
</MarketingShell>
