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

	onMount(() => {
		return initOfflineSync();
	});
</script>

<div class="flex min-h-screen flex-col">
	<Navbar isLoggedIn={true} user={data.user} />
	<OfflineBanner />
	<main class="flex-grow pb-28 pt-[calc(4rem+env(safe-area-inset-top))] md:pb-8">
		<div in:fade|local={{ duration: 100 }}>
			<slot />
		</div>
	</main>
	<BottomNav isLoggedIn={true} />
	<Toaster />
</div>
