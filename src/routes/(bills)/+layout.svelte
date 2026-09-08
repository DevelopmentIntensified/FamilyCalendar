<script lang="ts">
	import { fade } from 'svelte/transition';
	import '../../app.css';
	import type { LayoutData } from './$types';
	import Navbar from '$lib/components/Navbar.svelte';
	import OfflineBanner from '$lib/components/OfflineBanner.svelte';
	import Toaster from '$lib/components/Toaster.svelte';

	export let data: LayoutData;
</script>

<div class="flex min-h-screen flex-col">
	<Navbar isLoggedIn={true} user={data.user} />
	<OfflineBanner />
	<main class="flex-grow pb-24 pt-[calc(4rem+env(safe-area-inset-top))]">
		<div class="mx-auto max-w-2xl px-4 pt-2">
			<a href="/calendar" class="text-sm font-semibold text-sky-700 hover:underline">
				← Back to Calendar
			</a>
		</div>
		<div in:fade|local={{ duration: 100 }}>
			<slot />
		</div>
	</main>
	<Toaster />
</div>
