<script lang="ts">
	import Navbar from '$lib/components/Navbar.svelte';
	import Toaster from '$lib/components/Toaster.svelte';
	import { fade } from 'svelte/transition';
	import type { LayoutData } from './$types';
	import '../../app.css';

	export let data: LayoutData;
</script>

<div class="flex min-h-screen flex-col">
	<Navbar isLoggedIn={data.isLoggedIn} />
	<main class="flex-grow pt-[calc(4rem+env(safe-area-inset-top))]">
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
