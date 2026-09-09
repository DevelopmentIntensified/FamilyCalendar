<script lang="ts">
	import { page } from '$app/stores';
	import NotificationBell from '$lib/components/NotificationBell.svelte';
	import NavbarProfileMenu from '$lib/components/NavbarProfileMenu.svelte';
	import NavbarMobileMenu from '$lib/components/NavbarMobileMenu.svelte';
	import { loggedInNavItems, marketingNavItems, resolveActiveHref } from '$lib/utils/navItems';

	export let isLoggedIn = false;
	export let user: {
		firstName?: string;
		lastName?: string;
		email?: string;
		roles?: string[];
	} | null = null;

	let isOpen = false;
	let profileDropdownOpen = false;

	function toggleProfileDropdown() {
		profileDropdownOpen = !profileDropdownOpen;
	}

	function closeProfileDropdown() {
		profileDropdownOpen = false;
	}

	/** Privacy audit #029 M2: tell the service worker to drop all cached
	 * authed data on logout. Fire-and-forget; the form POST proceeds. */
	function purgeSwDataCache() {
		navigator.serviceWorker?.controller?.postMessage({ type: 'purge-data-cache' });
	}

	function handleOutsideClick(e: MouseEvent) {
		// Non-Element event targets (e.g. document) count as outside clicks.
		const target = e.target instanceof Element ? e.target : null;
		if (!target?.closest('[data-testid="profile-dropdown-container"]')) {
			closeProfileDropdown();
		}
	}

	$: navItems = isLoggedIn ? loggedInNavItems : marketingNavItems;

	// Longest prefix wins, so /calendar/tasks highlights Tasks - not Calendar.
	$: activeHref = resolveActiveHref($page.url.pathname, navItems);
	$: isActive = (href: string) => activeHref === href;

	function toggleMenu() {
		isOpen = !isOpen;
	}

	function closeMenu() {
		isOpen = false;
	}
</script>

<svelte:window
	on:click={handleOutsideClick}
	on:keydown={(e) => e.key === 'Escape' && closeProfileDropdown()}
/>

<nav
	class="fixed top-0 z-50 w-full border-b border-slate-200 bg-white/95 backdrop-blur-sm print:hidden"
	style="padding-top: env(safe-area-inset-top)"
>
	<div class="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
		<div class="flex items-center gap-2">
			<a href="/" class="flex items-center gap-2">
				<svg
					class="h-8 w-8 text-primary-600"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<rect x="3" y="4" width="18" height="18" rx="2" />
					<line x1="16" y1="2" x2="16" y2="6" />
					<line x1="8" y1="2" x2="8" y2="6" />
					<line x1="3" y1="10" x2="21" y2="10" />
				</svg>
				<span class="text-xl font-bold text-slate-800">Family Planz</span>
			</a>
		</div>
		<div class="hidden items-center gap-6 md:flex">
			{#each navItems as item}
				<a
					href={item.href}
					data-sveltekit-preload-data="hover"
					class="text-sm font-medium transition-colors
						{isActive(item.href) ? 'text-primary-600' : 'text-slate-600 hover:text-slate-900'}"
				>
					{item.label}
				</a>
			{/each}
		</div>
		<div class="hidden items-center gap-3 md:flex">
			{#if isLoggedIn}
				<NotificationBell />
				<div class="relative" data-testid="profile-dropdown-container">
					<button
						on:click={toggleProfileDropdown}
						class="flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
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
						<NavbarProfileMenu
							{user}
							onNavigate={closeProfileDropdown}
							onLogoutSubmit={purgeSwDataCache}
						/>
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
			on:click={toggleMenu}
			class="flex h-11 w-11 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 md:hidden"
		>
			<span class="sr-only">{isOpen ? 'Close menu' : 'Open menu'}</span>
			{#if isOpen}
				<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M6 18L18 6M6 6l12 12"
					/>
				</svg>
			{:else}
				<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M4 6h16M4 12h16M4 18h16"
					/>
				</svg>
			{/if}
		</button>
	</div>

	{#if isOpen}
		<NavbarMobileMenu
			{isLoggedIn}
			{user}
			{navItems}
			{activeHref}
			onNavigate={closeMenu}
			onLogoutSubmit={purgeSwDataCache}
		/>
	{/if}
</nav>
