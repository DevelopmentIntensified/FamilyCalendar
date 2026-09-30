<script lang="ts">
	import Navbar from '$lib/components/Navbar.svelte';
	import Toaster from '$lib/components/Toaster.svelte';
	import { fade } from 'svelte/transition';
	import { seoTags, absolute, seoFor } from '$lib/marketing/seo';
	// The marketing theme, lifted from prototypes/calendar-ui/. Imported here
	// rather than in app.css so the calendar prototype page stays the single
	// description of the design language and this is only its application.
	import '$lib/marketing/theme.css';
	import type { LayoutData } from './$types';

	export let data: LayoutData;

	/**
	 * Only the share tags. <title> stays with each page, which already sets it in
	 * its own svelte:head — emitting one here too would put two <title> elements
	 * in every document, and a crawler concatenates those. og:title is a separate
	 * tag and is what a share renders, so the page owns one and this owns the
	 * other; seo.test.ts fails if the two drift apart.
	 *
	 * The app's own routes are deliberately not covered: /account and
	 * /family/[id] are per-person, and a share card for someone's family page is
	 * not a thing anyone should be able to trigger.
	 */
	$: tags = seoTags(data.origin, data.pathname);
	$: entry = seoFor(data.pathname);
	$: canonical = absolute(data.origin, data.pathname);
</script>

<svelte:head>
	<meta name="description" content={entry.description} />
	<link rel="canonical" href={canonical} />
	{#each tags as tag}
		{#if tag.property}
			<meta property={tag.property} content={tag.content} />
		{:else}
			<meta name={tag.name} content={tag.content} />
		{/if}
	{/each}
</svelte:head>

<div class="mp-canvas flex min-h-screen flex-col">
	<a class="mp-skip" href="#main">Skip to content</a>
	<Navbar isLoggedIn={data.isLoggedIn} />
	<main id="main" class="flex-grow pt-[calc(4rem+env(safe-area-inset-top))]">
		<div in:fade|local={{ duration: 150 }}>
			<slot />
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
	</p>
	<p class="text-sm text-slate-500">
		&copy; {new Date().getFullYear()} FamilyPlanz. All rights reserved.
	</p>
</footer>

<Toaster />
