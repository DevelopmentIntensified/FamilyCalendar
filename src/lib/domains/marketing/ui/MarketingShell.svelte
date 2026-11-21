<!--
	The `(marketing)` group's chrome: the share tags from the one SEO table (the
	description, the self-referencing canonical and the og/twitter tags — never a
	<title>, which stays with each page so a document keeps exactly one), the
	skip link, the 150 ms local fade the legacy layout applied, and the footer.

	The navbar and the toaster are the SHELL module's chrome (`Navbar.svelte`,
	`Toaster.svelte`), not ported yet, so the layout hands them in as snippets —
	the sanctioned seam (rule R1). When shell lands, the layout passes its
	components here and nothing in this file changes.

	The `--mp-*` tokens and the `.mp-*` vocabulary live in `MarketingTheme.svelte`
	(the legacy `src/lib/marketing/theme.css`), imported once, here.

	Doc: ../README.md#invariants
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { fade } from 'svelte/transition';
	import MarketingTheme from './MarketingTheme.svelte';
	import { pageSeo } from '../marketing.seo.rules';

	interface Props {
		/** The layout load: the request's own origin and pathname, plus the footer's year. */
		data: { origin: string; pathname: string; year: number };
		nav?: Snippet;
		toaster?: Snippet;
		children?: Snippet;
	}

	let { data, nav, toaster, children }: Props = $props();

	const seo = $derived(pageSeo(data.origin, data.pathname));
</script>

<svelte:head>
	<meta name="description" content={seo.description} />
	<link rel="canonical" href={seo.canonical} />
	{#each seo.meta as tag}
		{#if 'property' in tag}
			<meta property={tag.property} content={tag.content} />
		{:else}
			<meta name={tag.name} content={tag.content} />
		{/if}
	{/each}
</svelte:head>

<div class="mp-canvas flex min-h-screen flex-col">
	<MarketingTheme />
	<a class="mp-skip" href="#main">Skip to content</a>
	{#if nav}{@render nav()}{/if}
	<main id="main" class="flex-grow pt-[calc(4rem+env(safe-area-inset-top))]">
		<div in:fade|local={{ duration: 150 }}>
			{#if children}{@render children()}{/if}
		</div>
	</main>
</div>

<footer class="border-t border-slate-200 bg-white py-6 text-center">
	<p class="mb-2 flex flex-wrap items-center justify-center gap-x-1 text-sm text-slate-500">
		<a href="/changelog" class="rounded px-3 py-2.5 transition-colors hover:text-slate-700"
			>Changelog</a
		>
		<a href="/roadmap" class="rounded px-3 py-2.5 transition-colors hover:text-slate-700">Roadmap</a
		>
		<a href="/android" class="rounded px-3 py-2.5 transition-colors hover:text-slate-700"
			>Android app</a
		>
	</p>
	<p class="text-sm text-slate-500">
		&copy; {data.year} FamilyPlanz. All rights reserved.
	</p>
</footer>

{#if toaster}{@render toaster()}{/if}
