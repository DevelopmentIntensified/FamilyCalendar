<script lang="ts">
	import Navbar from '$lib/components/Navbar.svelte';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import Toaster from '$lib/components/Toaster.svelte';
	import type { LayoutData } from './$types';

	export let data: LayoutData;
</script>

<div class="flex min-h-screen flex-col">
	<Navbar isLoggedIn={true} user={data.user} />
	<!-- Issue 255: bottom padding clears the phone tab bar. -->
	<div class="flex-grow pb-20 md:pb-0 print:pb-0">
		<slot />
	</div>
	<BottomNav isLoggedIn={true} />
	<Toaster />
</div>
