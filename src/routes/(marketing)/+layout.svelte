<script lang="ts">
	import Navbar from '$lib/components/DefaultNavbar.svelte';
	import { fade } from 'svelte/transition';
	import type { LayoutData } from './$types';
	import '../../app.css';

	export let data: LayoutData;
	console.warn('DEBUGPRINT[3]: +layout.svelte:6: data=', data);
	$: pathname = data.pathname;
</script>

<div class="flex min-h-screen flex-col">
	<Navbar isAdmin={data.user?.isAdmin} isLoggedIn={data.isLoggedIn} />
	{#key pathname}
		<main class="flex-grow" in:fade={{ duration: 300, delay: 200 }} out:fade={{ duration: 100 }}>
			<slot />
		</main>
	{/key}
</div>

<footer class="bg-gray-100 py-4 text-center">
	<p>&copy; {new Date().getFullYear()} Development Intensified. All rights reserved.</p>
</footer>
