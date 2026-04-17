<script lang="ts">
	import { fade } from 'svelte/transition';
	import '../../app.css';
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
</div>
