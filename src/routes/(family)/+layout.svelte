<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import '../../app.css';
	import type { LayoutData } from './$types';
	import Navbar from '$lib/components/Navbar.svelte';
	import OfflineBanner from '$lib/components/OfflineBanner.svelte';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import Toaster from '$lib/components/Toaster.svelte';
	import { initOfflineSync } from '$lib/utils/offline';

	export let data: LayoutData;
	$: pathname = data.pathname;

	onMount(() => {
		return initOfflineSync();
	});
</script>

<div class="flex min-h-screen flex-col">
	<Navbar isLoggedIn={true} user={data.user} />
	<OfflineBanner />
	{#key pathname}
		<main class="pt-[calc(4rem+env(safe-area-inset-top))] flex-grow pb-28 md:pb-8" in:fade={{ duration: 100 }} out:fade={{ duration: 50 }}>
			<slot />
		</main>
	{/key}
	<BottomNav isLoggedIn={true} />
	<Toaster />
</div>
