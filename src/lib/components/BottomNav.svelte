<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { bottomNavItems, resolveActiveHref } from '$lib/utils/navItems';

	export let isLoggedIn = false;

	/**
	 * Test seam: override the current route path instead of reading $page.
	 * When set, the component skips the $app/stores subscription (which only
	 * exists inside a running SvelteKit app) and fetches the badge once.
	 */
	export let currentPath: string | undefined = undefined;

	let path = currentPath ?? '/';

	// One list, two surfaces. The tab bar used to carry its own hardcoded copy,
	// which is how Groceries ended up reachable on desktop and nowhere on a
	// phone (issue 065).
	const items = bottomNavItems;

	// Unread count for the Alerts tab. Fetched from /api/notifications only
	// when the user is logged in, so guests never trigger a 401 loop.
	let unreadCount = 0;

	function isNumber(v: unknown): v is number {
		return typeof v === 'number';
	}

	function isUnreadPayload(v: unknown): v is { unreadCount: unknown } {
		return typeof v === 'object' && v !== null && 'unreadCount' in v;
	}

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
			const data: unknown = await res.json();
			unreadCount = isUnreadPayload(data) && isNumber(data.unreadCount) ? data.unreadCount : 0;
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
		let unsubscribePage: () => void;
		if (currentPath === undefined) {
			unsubscribePage = page.subscribe((p) => {
				path = p.url.pathname;
				refreshBadge();
			});
		} else {
			path = currentPath;
			refreshBadge();
			unsubscribePage = () => {};
		}
		document.addEventListener('visibilitychange', onVisibilityChanged);
		return () => {
			unsubscribePage();
			document.removeEventListener('visibilitychange', onVisibilityChanged);
		};
	});

	// Longest prefix wins so /calendar/dashboard highlights Dashboard, not Calendar.
	// Hrefs compare pathname-only so the Calendar escape hatch still highlights (#056).
	// Shared with the desktop nav rather than reimplemented — the duplicate copy
	// is what let the two navs disagree (issue 065).
	$: activeHref = resolveActiveHref(path, items);
	$: active = items.find((i) => i.href === activeHref) ?? null;

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
		if (!vv || !window.innerHeight) {
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
		? 'pointer-events-none opacity-0 transition-opacity'
		: 'transition-opacity'}"
	aria-label="Primary navigation"
>
	<div
		class="grid"
		style="padding-bottom: env(safe-area-inset-bottom); grid-template-columns: repeat({items.length}, minmax(0, 1fr))"
	>
		{#each items as item (item.href)}
			{@const on = active?.href === item.href}
			<a
				href={item.href}
				data-sveltekit-preload-data="hover"
				aria-current={on ? 'page' : undefined}
				aria-label={item.href === '/calendar/notifications' && unreadCount > 0
					? `Alerts (${unreadCount} unread)`
					: item.shortLabel
						? item.label
						: undefined}
				class="flex min-h-[52px] min-w-0 flex-col items-center justify-center gap-0.5 py-2.5"
			>
				<span
					class="relative flex h-7 items-center justify-center rounded-full transition-colors {on
						? 'bg-primary-50 text-primary-600'
						: 'text-slate-400'}"
				>
					<svg
						class="h-5 w-5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<!-- eslint-disable-next-line svelte/no-at-html-tags -- icons are static in-file literals, never user input -->
						{@html item.icon}
					</svg>
					{#if item.href === '/calendar/notifications' && unreadCount > 0}
						<span
							class="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary-600 px-1 text-[10px] font-semibold leading-none text-white"
						>
							{unreadCount > 99 ? '99+' : unreadCount}
						</span>
					{/if}
				</span>
				<span
					class="w-full truncate px-0.5 text-center text-[11px] font-medium leading-none {on
						? 'text-primary-600'
						: 'text-slate-500'}"
				>
					{item.shortLabel ?? item.label}
				</span>
			</a>
		{/each}
	</div>
</nav>
