<script lang="ts">
	import Navbar from '$lib/components/Navbar.svelte';
	import { fade } from 'svelte/transition';
	import type { LayoutData } from './$types';
	import '../../app.css';

	export let data: LayoutData;
	$: pathname = data.pathname;
</script>

<div class="flex min-h-screen flex-col">
	<Navbar isLoggedIn={data.isLoggedIn} />
	{#key pathname}
		<main class="pt-16 flex-grow" in:fade={{ duration: 300, delay: 200 }} out:fade={{ duration: 100 }}>
			<slot />
		</main>
	{/key}
</div>

<footer class="border-t border-slate-200 bg-white py-6 text-center">
	<p class="text-sm text-slate-500">&copy; {new Date().getFullYear()} FamilyPlanz. All rights reserved.</p>
</footer>
