<script lang="ts">
	import { fade } from 'svelte/transition';
	import '../../../app.css';
	import type { LayoutData } from './$types';
	import Navbar from '$lib/components/Navbar.svelte';

	export let data: LayoutData;
	$: pathname = data.pathname;
</script>

<div class="flex min-h-screen flex-col">
	<Navbar isLoggedIn={true} />
	{#key pathname}
		<main class="pt-16 flex-grow" in:fade={{ duration: 300, delay: 200 }} out:fade={{ duration: 100 }}>
			<slot />
		</main>
	{/key}
	<footer
		class="fixed bottom-0 left-0 block h-16 w-full border-slate-200 bg-white py-4 text-center shadow-xl shadow-slate-900"
	>
		{#if !pathname.includes('new')}
			<a
				title="New Event"
				href="/calendar/event/new"
				class="fixed inset-x-0 bottom-12 m-auto flex h-14 w-14 items-center justify-center rounded-full bg-secondary shadow-md shadow-slate-300"
			>
				<svg class="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
				</svg>
			</a>
		{/if}
	</footer>
</div>
