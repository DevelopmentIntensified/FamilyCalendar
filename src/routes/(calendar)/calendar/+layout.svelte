<script lang="ts">
	import { fade } from 'svelte/transition';
	import '../../../app.css';
	import type { LayoutData } from './$types';
	import CalendarNavbar from '$lib/components/CalendarNavbar.svelte';
	import DefaultNavbar from '$lib/components/DefaultNavbar.svelte';

	export let data: LayoutData;
	console.warn('DEBUGPRINT[3]: +layout.svelte:6: data=', data);
	$: pathname = data.pathname;
</script>

<div class="flex min-h-screen flex-col">
	<DefaultNavbar isAdmin={false} isLoggedIn={true} />
	{#key pathname}
		<main class="flex-grow" in:fade={{ duration: 300, delay: 200 }} out:fade={{ duration: 100 }}>
			<slot />
		</main>
	{/key}
	<footer class="absolute bottom-0 left-0 block bg-gray-100 py-4 text-center"></footer>
</div>
