<!--
	The auth pages' outer shell: the slate backdrop, the Family Planz brand
	link home, and the card slot. Title in, body as a snippet.

	Doc: ../README.md#public-interface
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import BrandMark from '$lib/kernel/ui/BrandMark.svelte';

	interface Props {
		/** The document title, e.g. `Log In - Family Planz`. */
		title: string;
		children: Snippet;
	}

	let { title, children }: Props = $props();
</script>

<svelte:head>
	<title>{title}</title>
</svelte:head>

<div class="flex min-h-screen flex-col items-center bg-slate-50 px-4 pb-16 pt-10 sm:pt-16">
	<a
		href="/"
		aria-label="Family Planz home"
		class="mb-8 flex items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
	>
		<BrandMark size={20} class="text-primary-600" />
		<span class="text-lg font-bold tracking-tight text-slate-800">Family Planz</span>
	</a>
	{@render children()}
</div>
