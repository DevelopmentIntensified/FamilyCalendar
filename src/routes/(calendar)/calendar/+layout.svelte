<script lang="ts">
	import { fade } from 'svelte/transition';
	import '../../../app.css';
	import type { LayoutData } from './$types';
	import Navbar from '$lib/components/Navbar.svelte';

	export let data: LayoutData;
	$: pathname = data.pathname;

	const INACTIVITY_WINDOW_DAYS = 90;
	$: isAnonymous = !data.user?.email;
	$: daysRemaining = (() => {
		if (!data.user?.lastActiveAt) return INACTIVITY_WINDOW_DAYS;
		const elapsed = Date.now() - new Date(data.user.lastActiveAt).getTime();
		return Math.max(0, Math.ceil(INACTIVITY_WINDOW_DAYS - elapsed / (24 * 60 * 60 * 1000)));
	})();
	$: urgent = isAnonymous && daysRemaining <= 14;
</script>

<div class="flex min-h-screen flex-col">
	<Navbar isLoggedIn={true} user={data.user} />
	{#if isAnonymous}
		<div
			class="fixed top-16 left-0 z-40 w-full px-4 py-2.5 text-center text-sm {urgent
				? 'bg-red-50 text-red-800 border-b border-red-200'
				: 'bg-amber-50 text-amber-800 border-b border-amber-200'}"
			role="status"
		>
			{#if urgent}
				⚠️ Guest calendar — inactive accounts are deleted after 90 days.
				<strong>{daysRemaining} day{daysRemaining === 1 ? '' : 's'} left.</strong>
				<a href="/claim" class="font-semibold underline">Save your data with an email</a>
			{:else}
				You're using a guest calendar — your events can't sync to other devices.
				<a href="/claim" class="font-semibold underline">Add an email to save them</a>
				<span class="text-amber-600">(deleted after 90 days of inactivity)</span>
			{/if}
		</div>
	{/if}
	{#key pathname}
		<main class="pt-16 flex-grow pb-24 {isAnonymous ? 'mt-10' : ''}" in:fade={{ duration: 300, delay: 200 }} out:fade={{ duration: 100 }}>
			<slot />
		</main>
	{/key}
	<footer class="fixed bottom-0 left-0 w-full border-t border-slate-200 bg-white py-3 text-center text-xs text-slate-500">
		<div class="flex items-center justify-center gap-4">
			<span>&copy; {new Date().getFullYear()} FamilyPlanz</span>
			<span class="text-slate-300">|</span>
			<a href="/about" class="hover:text-primary-600">About</a>
			<a href="/privacy" class="hover:text-primary-600">Privacy</a>
			<a href="/contact" class="hover:text-primary-600">Contact</a>
		</div>
	</footer>
</div>
