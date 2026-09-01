<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';

	export let isLoggedIn = false;

	const items = [
		{
			href: '/calendar',
			label: 'Calendar',
			icon: '<rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />'
		},
		{
			href: '/calendar/dashboard',
			label: 'Dashboard',
			icon: '<rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />'
		},
		{
			href: '/calendar/tasks',
			label: 'Tasks',
			icon: '<circle cx="12" cy="12" r="9" /><path d="M9 12l2 2 4-4" />'
		},
		{
			href: '/calendar/notifications',
			label: 'Alerts',
			icon: '<path d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />'
		},
		{
			href: '/family',
			label: 'Family',
			icon: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />'
		}
	] as const;

	// Unread count for the Alerts tab. Fetched from /api/notifications only
	// when the user is logged in, so guests never trigger a 401 loop.
	let unreadCount = 0;

	async function refreshBadge() {
		if (!isLoggedIn) {
			unreadCount = 0;
			return;
		}
		try {
			const res = await fetch('/api/notifications');
			if (!res.ok) {
				unreadCount = 0;
				return;
			}
			const data = await res.json();
			unreadCount = typeof data.unreadCount === 'number' ? data.unreadCount : 0;
		} catch {
			// nav stays silent on transient failures
			unreadCount = 0;
		}
	}

	function onVisibilityChanged() {
		if (document.visibilityState === 'visible') refreshBadge();
	}

	onMount(() => {
		// Re-fetch on mount and on every route change so the badge stays in
		// sync after the user marks notifications read and navigates away.
		const unsubscribePage = page.subscribe(() => refreshBadge());
		document.addEventListener('visibilitychange', onVisibilityChanged);
		return () => {
			unsubscribePage();
			document.removeEventListener('visibilitychange', onVisibilityChanged);
		};
	});

	// Longest prefix wins so /calendar/dashboard highlights Dashboard, not Calendar.
	$: path = $page.url.pathname;
	$: active = (() => {
		const matched = items.filter((i) => path === i.href || path.startsWith(i.href + '/'));
		if (matched.length === 0) return null;
		return matched.reduce((a, b) => (b.href.length > a.href.length ? b : a));
	})();

	// If auth flips off while the nav stays mounted, drop the badge.
	$: if (!isLoggedIn) unreadCount = 0;

	// Hide the fixed nav while the on-screen keyboard is open. We only toggle a
	// class (never unmount) so a11y/tests still see the nav; pointer events and
	// paint are suppressed while hidden. Falls back to always visible when
	// visualViewport isn't available.
	let keyboardOpen = false;
	const KEYBOARD_THRESHOLD = 150;

	function syncKeyboard() {
		const vv = window.visualViewport;
		if (!vv || typeof vv.height !== 'number' || !window.innerHeight) {
			keyboardOpen = false;
			return;
		}
		keyboardOpen = window.innerHeight - vv.height > KEYBOARD_THRESHOLD;
	}

	function onResize() {
		syncKeyboard();
	}

	onMount(() => {
		syncKeyboard();
		window.visualViewport?.addEventListener('resize', onResize);
		window.visualViewport?.addEventListener('scroll', onResize);
		window.addEventListener('resize', onResize);
		return () => {
			window.visualViewport?.removeEventListener('resize', onResize);
			window.visualViewport?.removeEventListener('scroll', onResize);
			window.removeEventListener('resize', onResize);
		};
	});
</script>

<nav
	class="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-sm md:hidden print:hidden {keyboardOpen
		? 'opacity-0 pointer-events-none transition-opacity'
		: 'transition-opacity'}"
	aria-label="Primary navigation"
>
	<div class="grid grid-cols-5" style="padding-bottom: env(safe-area-inset-bottom)">
		{#each items as item (item.href)}
			{@const on = active?.href === item.href}
			<a
				href={item.href}
				data-sveltekit-preload-data="hover"
				aria-current={on ? 'page' : undefined}
				aria-label={item.href === '/calendar/notifications' && unreadCount > 0
					? `Alerts (${unreadCount} unread)`
					: undefined}
				class="flex min-w-0 flex-col items-center justify-center gap-0.5 py-2"
			>
				<span
					class="relative flex h-7 min-w-14 items-center justify-center rounded-full transition-colors {on
						? 'bg-primary-50 text-primary-600'
						: 'text-slate-400'}"
				>
					<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<!-- svelte-ignore a11y-invalid-attribute -->
						{@html item.icon}
					</svg>
					{#if item.href === '/calendar/notifications' && unreadCount > 0}
						<span
							class="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary-600 px-1 text-[10px] font-semibold leading-none text-white"
						>
							{unreadCount > 99 ? '99+' : unreadCount}
						</span>
					{/if}
				</span>
				<span class="text-[11px] font-medium leading-none {on ? 'text-primary-600' : 'text-slate-500'}">
					{item.label}
				</span>
			</a>
		{/each}
	</div>
</nav>