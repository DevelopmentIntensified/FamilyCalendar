<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import { page } from '$app/stores';
	import { invalidateAll } from '$app/navigation';
	import '../../../app.css';
	import type { LayoutData } from './$types';
	import Navbar from '$lib/components/Navbar.svelte';
	import OfflineBanner from '$lib/components/OfflineBanner.svelte';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import Toaster from '$lib/components/Toaster.svelte';
	import { initOfflineSync } from '$lib/utils/offline';

	export let data: LayoutData;
	$: pathname = data.pathname;

	onMount(() => {
		// Auto-detect client timezone if user still has the 'UTC' default.
		if (data.userSettings?.timeZone === 'UTC') {
			const clientTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
			if (clientTz && clientTz !== 'UTC') {
				fetch('/calendar/setUserDefaultTimeZone', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ timeZone: clientTz })
				}).then(() => invalidateAll());
			}
		}
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
	$: showTopNotice =
		isAnonymous || (justClaimed && !claimedDismissed) || (justMerged && !mergedDismissed);
	// Offline banner visibility is owned by OfflineBanner (bind:visible below).
	let offlineVisible = false;
	$: bannerCount = (offlineVisible ? 1 : 0) + (showTopNotice ? 1 : 0);
</script>

<div class="flex min-h-screen flex-col">
	<Navbar isLoggedIn={true} user={data.user} />
	<!-- Single fixed banner stack: offline + guest/claim notices share one
	offset so they can never overlap. -->
	<div
		class="fixed left-0 top-[calc(4rem+env(safe-area-inset-top))] z-40 flex w-full flex-col print:hidden"
	>
		<OfflineBanner stacked={true} bind:visible={offlineVisible} />
		{#if justClaimed && !claimedDismissed}
			<div
				class="flex w-full items-center justify-center gap-3 border-b border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-800"
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
				class="flex w-full items-center justify-center gap-3 border-b border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-800"
				role="status"
				transition:fade={{ duration: 150 }}
			>
				<span>
					✅ Brought over {mergedCount} event{mergedCount === 1 ? '' : 's'}{mergedTasks > 0
						? ` and ${mergedTasks} task${mergedTasks === 1 ? '' : 's'}`
						: ''} from your guest calendar.
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
				class="w-full px-4 py-2.5 text-center text-sm {urgent
					? 'border-b border-red-200 bg-red-50 text-red-800'
					: 'border-b border-amber-200 bg-amber-50 text-amber-800'}"
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
	</div>
	{#key pathname}
		<main
			class="flex-grow pb-28 pt-[calc(4rem+env(safe-area-inset-top))] md:pb-24 {bannerCount > 0
				? 'mt-10'
				: ''} print:!mt-0 print:min-h-0 print:!pb-0 print:!pt-0"
			in:fade={{ duration: 100 }}
			out:fade={{ duration: 50 }}
		>
			<slot />
		</main>
	{/key}
	<BottomNav isLoggedIn={true} />
	<Toaster />
	<footer
		class="fixed bottom-0 left-0 z-30 hidden w-full border-t border-slate-200 bg-white py-3 text-center text-xs text-slate-500 md:block print:hidden"
	>
		<div class="flex items-center justify-center gap-4">
			<span>&copy; {new Date().getFullYear()} FamilyPlanz</span>
			<span class="text-slate-300">|</span>
			<a href="/about" class="hover:text-primary-600">About</a>
			<a href="/privacy" class="hover:text-primary-600">Privacy</a>
			<a href="/contact" class="hover:text-primary-600">Contact</a>
		</div>
	</footer>
</div>
