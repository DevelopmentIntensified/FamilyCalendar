<script lang="ts">
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';
	import { fade } from 'svelte/transition';
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import type { LayoutData } from './$types';
	import Navbar from '$lib/components/Navbar.svelte';
	import OfflineBanner from '$lib/components/OfflineBanner.svelte';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import Toaster from '$lib/components/Toaster.svelte';
	import { initOfflineSync } from '$lib/utils/offline';
	import { isAnonymousAccount } from '$lib/utils/anonymous';

	let { data, children }: { data: LayoutData; children?: Snippet } = $props();

	onMount(() => {
		// Auto-detect client timezone if user still has the 'UTC' default —
		// at most ONCE per user per browser (#041). Previously every mount
		// with UTC settings fired POST + invalidateAll (a full second load).
		const tzKey = `familyplanz:tzProbed:${data.user?.id ?? 'anon'}`;
		let tzProbed = false;
		try {
			tzProbed = localStorage.getItem(tzKey) !== null;
		} catch {
			/* storage unavailable — fall through and probe */
		}
		if (!tzProbed && data.userSettings?.timeZone === 'UTC') {
			try {
				localStorage.setItem(tzKey, '1');
			} catch {
				/* best-effort flag; a retry next mount is harmless */
			}
			const clientTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
			if (clientTz && clientTz !== 'UTC') {
				fetch('/calendar/setUserDefaultTimeZone', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ timeZone: clientTz }),
					keepalive: true
				})
					.then(() => invalidateAll())
					.catch(() => {
						/* navigation-away aborts are expected (#049) */
					});
			}
		}
		return initOfflineSync();
	});

	const INACTIVITY_WINDOW_DAYS = 90;
	const isAnonymous = $derived(isAnonymousAccount(data.user));
	const daysRemaining = $derived.by(() => {
		if (!data.user?.lastActiveAt) return INACTIVITY_WINDOW_DAYS;
		const elapsed = Date.now() - new Date(data.user.lastActiveAt).getTime();
		return Math.max(0, Math.ceil(INACTIVITY_WINDOW_DAYS - elapsed / (24 * 60 * 60 * 1000)));
	});
	const urgent = $derived(isAnonymous && daysRemaining <= 14);
	const justClaimed = $derived(page.url.searchParams.get('claimed') === '1' && !isAnonymous);
	const mergedCount = $derived(parseInt(page.url.searchParams.get('merged') || ''));
	const mergedTasks = $derived(parseInt(page.url.searchParams.get('tasks') || '0'));
	const justMerged = $derived(Number.isFinite(mergedCount) && mergedCount >= 0 && !isAnonymous);
	let claimedDismissed = $state(false);
	let mergedDismissed = $state(false);
	// Unverified password signups: the account exists and the session is set,
	// but the email isn't confirmed yet (member search only lists verified
	// users). The banner is self-sufficient — code input + resend inline —
	// because a user who navigated away has nowhere else to enter the code.
	const needsVerify = $derived(!isAnonymous && data.user?.emailVerified === false);
	let verifyDismissed = $state(false);
	let verifyCode = $state('');
	let verifyBusy = $state(false);
	let verifyError = $state('');
	let verifyResent = $state(false);
	const showTopNotice = $derived(
		isAnonymous ||
			(needsVerify && !verifyDismissed) ||
			(justClaimed && !claimedDismissed) ||
			(justMerged && !mergedDismissed)
	);
	// Offline banner visibility is owned by OfflineBanner and reported via
	// onVisibleChange below. It is deliberately not a `bind:` — a
	// BindDirective on a child component makes Svelte 5.20.1 emit its legacy
	// SSR settle loop, whose render helper is a function *expression* Rollup
	// drops from the server bundle, leaving a bare call that 500s every
	// /calendar GET (#200).
	let offlineVisible = $state(false);
	const bannerCount = $derived((offlineVisible ? 1 : 0) + (showTopNotice ? 1 : 0));
	async function submitVerifyCode() {
		if (!verifyCode.trim() || verifyBusy) return;
		verifyBusy = true;
		verifyError = '';
		try {
			const res = await fetch('/signup/password/verify', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code: verifyCode.trim() })
			});
			if (res.ok) {
				await invalidateAll();
			} else {
				const body = await res.json().catch(() => ({}));
				verifyError = body.error || 'Invalid code';
			}
		} catch {
			verifyError = 'Verification failed — check your connection and try again.';
		} finally {
			verifyBusy = false;
		}
	}

	async function resendVerifyCode() {
		if (verifyBusy) return;
		verifyBusy = true;
		verifyError = '';
		try {
			const res = await fetch('/signup/password/resend', { method: 'POST' });
			if (res.ok) {
				verifyResent = true;
				setTimeout(() => (verifyResent = false), 3000);
			} else {
				const body = await res.json().catch(() => ({}));
				verifyError = body.error || "Couldn't resend the code — try again.";
			}
		} catch {
			verifyError = "Couldn't resend the code — check your connection.";
		} finally {
			verifyBusy = false;
		}
	}

</script>
<div class="flex min-h-screen flex-col">
	<Navbar isLoggedIn={true} user={data.user} />
	<!-- Single fixed banner stack: offline + guest/claim notices share one
	offset so they can never overlap. -->
	<div
		class="fixed left-0 top-[calc(4rem+env(safe-area-inset-top))] z-40 flex w-full flex-col print:hidden"
	>
		<OfflineBanner stacked={true} onVisibleChange={(v) => (offlineVisible = v)} />
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
		{:else if needsVerify && !verifyDismissed}
			<div
				class="w-full border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800"
				role="status"
				transition:fade={{ duration: 150 }}
			>
				<div class="mx-auto flex max-w-xl flex-col items-center gap-2">
					<span class="text-center">
						Your email isn't verified yet — enter the code we sent to unlock family
						features like member search.
					</span>
					<form
						class="flex w-full items-center justify-center gap-2"
						onsubmit={(e) => {
							e.preventDefault();
							submitVerifyCode();
						}}
					>
						<input
							type="text"
							bind:value={verifyCode}
							placeholder="Verification code"
							autocomplete="one-time-code"
							inputmode="numeric"
							aria-label="Verification code"
							class="w-40 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-center text-sm tracking-[0.2em] text-slate-900 placeholder-slate-400 focus:border-primary-500 focus:outline-none"
						/>
						<button
							type="submit"
							disabled={verifyBusy || !verifyCode.trim()}
							class="min-h-[44px] rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
						>
							{verifyBusy ? 'Verifying…' : 'Verify'}
						</button>
						<button
							type="button"
							onclick={resendVerifyCode}
							disabled={verifyBusy}
							class="min-h-[44px] rounded px-1 text-sm underline disabled:opacity-50"
						>
							Resend
						</button>
						<button
							type="button"
							class="rounded-full p-1 font-semibold hover:bg-amber-100"
							aria-label="Dismiss"
							onclick={() => (verifyDismissed = true)}
						>
							✕
						</button>
					</form>
					{#if verifyResent}
						<span
							class="rounded-full bg-[#C4E9DA]/60 px-2.5 py-1 text-xs font-medium text-slate-800"
							>Sent again ✓</span
						>
					{/if}
					{#if verifyError}
						<span class="text-center text-xs font-medium text-red-700">{verifyError}</span>
					{/if}
				</div>
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
	<main
		class="flex-grow pb-28 pt-[calc(4rem+env(safe-area-inset-top))] md:pb-24 {bannerCount > 0
			? 'mt-10'
			: ''} print:!mt-0 print:min-h-0 print:!pb-0 print:!pt-0"
	>
		<div in:fade|local={{ duration: 100 }}>
			{@render children?.()}
		</div>
	</main>
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
