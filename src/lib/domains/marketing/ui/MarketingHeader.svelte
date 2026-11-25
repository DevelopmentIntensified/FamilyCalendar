<!--
	The `(marketing)` group's header: wordmark → `/`, the public destination
	links (logged-in visitors get the app's destinations instead, as the legacy
	navbar did), the Alerts bell, the avatar dropdown and the phone hamburger.

	`pathname`, `search` and the bell are props on purpose: the layout already
	has them (`$app/state`, `building`) and a prop keeps this file free of
	`$app/*`, so it renders in a test without a router. Navigation is the
	`pathname` prop: any completed navigation closes BOTH menus (issue 253: a
	bell goto or a logo tap used to leave them open), and Escape or an outside
	click closes the profile dropdown.

	The signed-in destinations are the shell's list, handed in by the layout as
	`appNavItems` — marketing may not import a screen (R1), and a second copy of
	the destination list is exactly the drift issue 065. The bug link is
	`feedback`'s `reportBugHref` (#257).

	Moved from the legacy `src/lib/components/Navbar.svelte` with the same
	markup, roles and copy.

	Doc: ../README.md#invariants
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { reportBugHref as bugHrefFor } from '$lib/kernel/ui/bugReportLink';
	import BrandMark from '$lib/kernel/ui/BrandMark.svelte';
	import {
		MARKETING_NAV,
		marketingActiveHref,
		type MarketingNavLink
	} from '../marketing.content.rules';
	import type { MarketingViewer } from '../marketing.contract';

	interface Props {
		pathname: string;
		/** `page.url.search` — the `?from=` half of the bug link; '' when prerendered. */
		search: string;
		isLoggedIn: boolean;
		user: MarketingViewer | null;
		/** The signed-in destinations (the shell's list minus the bell row). */
		appNavItems: readonly MarketingNavLink[];
		/** Alerts' bell; absent when no one is signed in. */
		bell?: Snippet;
	}

	let { pathname, search, isLoggedIn, user, appNavItems, bell }: Props = $props();

	/** Privacy audit #029 M2: tell the service worker to drop all cached
	 * authed data on logout. Fire-and-forget; the form POST proceeds. */
	function purgeSwDataCache() {
		if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
		navigator.serviceWorker?.controller?.postMessage({ type: 'purge-data-cache' });
	}

	const navItems = $derived(isLoggedIn ? appNavItems : MARKETING_NAV);
	const activeHref = $derived(marketingActiveHref(pathname, navItems));
	const bugHref = $derived(bugHrefFor(`${pathname}${search}`));

	let isOpen = $state(false);
	let profileDropdownOpen = $state(false);

	// Issue 253: any navigation (bell goto, bottom tabs, logo) closes menus, not
	// just clicks on the menu's own links — the legacy `afterNavigate` rule.
	let lastPath: string | undefined;
	$effect(() => {
		if (lastPath !== undefined && pathname !== lastPath) {
			isOpen = false;
			profileDropdownOpen = false;
		}
		lastPath = pathname;
	});

	function toggleProfileDropdown() {
		profileDropdownOpen = !profileDropdownOpen;
	}

	function closeProfileDropdown() {
		profileDropdownOpen = false;
	}

	function handleOutsideClick(e: MouseEvent) {
		// Non-Element event targets (e.g. document) count as outside clicks.
		const target = e.target instanceof Element ? e.target : null;
		if (!target?.closest('[data-testid="profile-dropdown-container"]')) {
			closeProfileDropdown();
		}
	}

	function toggleMenu() {
		isOpen = !isOpen;
	}

	function closeMenu() {
		isOpen = false;
	}
</script>

<svelte:window onclick={handleOutsideClick} onkeydown={(e) => e.key === 'Escape' && closeProfileDropdown()} />

<nav
	class="fixed top-0 z-50 w-full border-b border-slate-200 bg-white/95 backdrop-blur-sm print:hidden"
	style="padding-top: env(safe-area-inset-top)"
>
	<div class="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
		<div class="flex items-center gap-2">
			<a href="/" class="flex items-center gap-2">
				<BrandMark class="h-8 w-8 text-primary-600" />
				<span class="text-xl font-bold text-slate-800">Family Planz</span>
			</a>
		</div>
		<div class="hidden items-center gap-6 md:flex">
			{#each navItems as item}
				<a
					href={item.href}
					data-sveltekit-preload-data="hover"
					class="text-sm font-medium transition-colors
						{activeHref === item.href ? 'text-primary-600' : 'text-slate-600 hover:text-slate-900'}"
				>
					{item.label}
				</a>
			{/each}
		</div>
		<div class="hidden items-center gap-3 md:flex">
			{#if isLoggedIn}
				{@render bell?.()}
				<div class="relative" data-testid="profile-dropdown-container">
					<button
						onclick={toggleProfileDropdown}
						class="flex items-center gap-2 rounded-full bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
						aria-expanded={profileDropdownOpen}
						aria-haspopup="true"
					>
						<div
							class="flex h-7 w-7 items-center justify-center rounded-full bg-primary-600 text-xs font-bold text-white"
						>
							{user?.firstName?.[0] || user?.email?.[0] || 'U'}
						</div>
						<span class="max-w-32 truncate">{user?.firstName || 'User'}</span>
						<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M19 9l-7 7-7-7"
							/>
						</svg>
					</button>
					{#if profileDropdownOpen}
						{#await import('./MarketingProfileMenu.svelte') then { default: MarketingProfileMenu }}
							<MarketingProfileMenu
								{user}
								onNavigate={closeProfileDropdown}
								onLogoutSubmit={purgeSwDataCache}
								reportBugHref={bugHref}
							/>
						{/await}
					{/if}
				</div>
			{:else}
				<a href="/login" class="text-sm font-medium text-slate-600 hover:text-slate-900">
					Sign In
				</a>
				<a
					href="/signup"
					class="rounded-full bg-primary-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
				>
					Get Started
				</a>
			{/if}
		</div>

		<button
			onclick={toggleMenu}
			class="flex h-11 w-11 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 md:hidden"
		>
			<span class="sr-only">{isOpen ? 'Close menu' : 'Open menu'}</span>
			{#if isOpen}
				<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
				</svg>
			{:else}
				<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
				</svg>
			{/if}
		</button>
	</div>

	{#if isOpen}
		{#await import('./MarketingMobileMenu.svelte') then { default: MarketingMobileMenu }}
			<MarketingMobileMenu
				{isLoggedIn}
				{user}
				{navItems}
				{activeHref}
				onNavigate={closeMenu}
				onLogoutSubmit={purgeSwDataCache}
				reportBugHref={bugHref}
				{bell}
			/>
		{/await}
	{/if}
</nav>
