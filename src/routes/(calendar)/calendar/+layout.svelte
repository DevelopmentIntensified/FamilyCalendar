<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import { page } from '$app/stores';
	import '../../../app.css';
	import type { LayoutData } from './$types';
	import Navbar from '$lib/components/Navbar.svelte';
	import OfflineBanner from '$lib/components/OfflineBanner.svelte';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import { initOfflineSync } from '$lib/utils/offline';

	export let data: LayoutData;
	$: pathname = data.pathname;

	onMount(() => {
		return initOfflineSync();
	});

	const INACTIVITY_WINDOW_DAYS = 90;
	$: isAnonymous = !data.user?.email;
	$: daysRemaining = (() => {
		if (!data.user?.lastActiveAt) return INACTIVITY_WINDOW_DAYS;
		const elapsed = Date.now() - new Date(data.user.lastActiveAt).getTime();
		return Math.max(0, Math.ceil(INACTIVITY_WINDOW_DAYS - elapsed / (24 * 60 * 60 * 1000)));
	})();
	$: urgent = isAnonymous && daysRemaining <= 14;
	$: justClaimed = $page.url.searchParams.get('claimed') === '1' && !isAnonymous;
	$: mergedCount = parseInt($page.url.searchParams.get('merged') || '');
	$: mergedTasks = parseInt($page.url.searchParams.get('tasks') || '0');
	$: justMerged = Number.isFinite(mergedCount) && mergedCount >= 0 && !isAnonymous;
	let claimedDismissed = false;
	let mergedDismissed = false;
	$: showTopNotice = isAnonymous || (justClaimed && !claimedDismissed) || (justMerged && !mergedDismissed);
</script>

<div class="flex min-h-screen flex-col">
	<Navbar isLoggedIn={true} user={data.user} />
	<OfflineBanner />
	{#if justClaimed && !claimedDismissed}
		<div
			class="fixed top-[calc(4rem+env(safe-area-inset-top))] left-0 z-40 flex w-full items-center justify-center gap-3 border-b border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-800 print:hidden"
			role="status"
			transition:fade={{ duration: 150 }}
		>
			<span>✅ Email added — your calendar now syncs across devices.</span>
			<button
				type="button"
				class="rounded-full p-1 font-semibold hover:bg-green-100"
				aria-label="Dismiss"
				onclick={() => (claimedDismissed = true)}
			>
				✕
			</button>
		</div>
	{:else if justMerged && !mergedDismissed}
		<div
			class="fixed top-[calc(4rem+env(safe-area-inset-top))] left-0 z-40 flex w-full items-center justify-center gap-3 border-b border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-800 print:hidden"
			role="status"
			transition:fade={{ duration: 150 }}
		>
			<span>
				✅ Brought over {mergedCount} event{mergedCount === 1 ? '' : 's'}{mergedTasks > 0 ? ` and ${mergedTasks} task${mergedTasks === 1 ? '' : 's'}` : ''} from your guest calendar.
			</span>
			<button
				type="button"
				class="rounded-full p-1 font-semibold hover:bg-green-100"
				aria-label="Dismiss"
				onclick={() => (mergedDismissed = true)}
			>
				✕
			</button>
		</div>
	{:else if isAnonymous}
		<div
			class="fixed top-[calc(4rem+env(safe-area-inset-top))] left-0 z-40 w-full px-4 py-2.5 text-center text-sm print:hidden {urgent
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
		<main class="pt-[calc(4rem+env(safe-area-inset-top))] flex-grow pb-28 md:pb-24 {showTopNotice ? 'mt-10' : ''} print:!pt-0 print:!pb-0 print:!mt-0 print:min-h-0" in:fade={{ duration: 300, delay: 200 }} out:fade={{ duration: 100 }}>
			<slot />
		</main>
	{/key}
	<BottomNav isLoggedIn={true} />
	<footer class="fixed bottom-0 left-0 z-30 hidden w-full border-t border-slate-200 bg-white py-3 text-center text-xs text-slate-500 md:block print:hidden">
		<div class="flex items-center justify-center gap-4">
			<span>&copy; {new Date().getFullYear()} FamilyPlanz</span>
			<span class="text-slate-300">|</span>
			<a href="/about" class="hover:text-primary-600">About</a>
			<a href="/privacy" class="hover:text-primary-600">Privacy</a>
			<a href="/contact" class="hover:text-primary-600">Contact</a>
		</div>
	</footer>
</div>
