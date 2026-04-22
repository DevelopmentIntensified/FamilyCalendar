<script lang="ts">
	import { fade } from 'svelte/transition';
	import '../../../app.css';
	import type { LayoutData } from './$types';
	import Navbar from '$lib/components/Navbar.svelte';

	export let data: LayoutData;
	$: pathname = data.pathname;
</script>

<div class="flex min-h-screen flex-col">
	<Navbar isLoggedIn={true} user={data.user} />
	{#key pathname}
		<main class="pt-16 flex-grow" in:fade={{ duration: 300, delay: 200 }} out:fade={{ duration: 100 }}>
			<slot />
		</main>
	{/key}
	<footer class="fixed bottom-0 left-0 w-full border-t border-slate-200 bg-white py-3 text-center text-xs text-slate-500">
		<div class="flex items-center justify-center gap-4">
			<span>&copy; {new Date().getFullYear()} FamilyPlanz</span>
			<span class="text-slate-300">|</span>
			<a href="/about" class="hover:text-primary-600">About</a>
			<a href="/privacy" class="hover:text-primary-600">Privacy</a>
			<a href="/contact" class="hover:text-primary-600">Contact</a>
		</div>
	</footer>
	{#if !pathname.includes('new') && !pathname.includes('edit')}
		<a
			href="/calendar/event/new"
			class="fixed bottom-20 right-6 flex h-14 w-14 items-center justify-center rounded-full bg-primary-600 shadow-lg hover:bg-primary-700"
		>
			<svg class="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4" />
			</svg>
		</a>
	{/if}
</div>
