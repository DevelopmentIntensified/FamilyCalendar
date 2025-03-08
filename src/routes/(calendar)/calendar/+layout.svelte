<script lang="ts">
	import { fade } from 'svelte/transition';
	import '../../../app.css';
	import type { LayoutData } from './$types';
	import CalendarNavbar from '$lib/components/CalendarNavbar.svelte';
	import DefaultNavbar from '$lib/components/DefaultNavbar.svelte';
	import { goto } from '$app/navigation';
	import CodexPlus from 'virtual:icons/codex/plus';

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
	<footer
		class="fixed bottom-0 left-0 block h-16 w-full border-slate-200 bg-white py-4 text-center shadow-xl shadow-slate-900"
	>
		{#if !pathname.includes('new')}
			<!-- content here -->
			<a
				title="New Event"
				href="/calendar/event/new"
				class="fixed inset-x-0 bottom-12 m-auto h-14 w-14 rounded-full bg-secondary shadow-md shadow-slate-300"
			>
				<CodexPlus class="relative top-2 m-auto h-10 w-10 text-white" />
			</a>
		{/if}
		<!-- <div class="flex h-full w-full"> -->
		<!-- 	<a class="flex-1" href="/calendar/listview">list view</a> -->
		<!-- 	<a class="flex-1" href="/calendar/weekview">week view </a> -->
		<!-- </div> -->
	</footer>
</div>
