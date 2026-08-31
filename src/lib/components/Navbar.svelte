<script lang="ts">
	import { page } from '$app/stores';
	import { slide } from 'svelte/transition';
	import NotificationBell from '$lib/components/NotificationBell.svelte';

	export let isLoggedIn = false;
	export let user: { firstName?: string; lastName?: string; email?: string; roles?: string[] } | null =
		null;

	let isOpen = false;
	let profileDropdownOpen = false;

	function toggleProfileDropdown() {
		profileDropdownOpen = !profileDropdownOpen;
	}

	function closeProfileDropdown() {
		profileDropdownOpen = false;
	}

	function handleOutsideClick(e: MouseEvent) {
		const target = e.target as HTMLElement | null;
		if (!target?.closest?.('[data-testid="profile-dropdown-container"]')) {
			closeProfileDropdown();
		}
	}

	const marketingNavItems = [
		{ href: '/features', label: 'Features' },
		{ href: '/pricing', label: 'Pricing' },
		{ href: '/about', label: 'About' },
		{ href: '/contact', label: 'Contact' }
	];

	const loggedInNavItems = [
		{ href: '/calendar', label: 'Calendar' },
		{ href: '/calendar/tasks', label: 'Tasks' },
		{ href: '/family', label: 'Family' }
	];

	$: navItems = isLoggedIn ? loggedInNavItems : marketingNavItems;

	// Longest prefix wins, so /calendar/tasks highlights Tasks - not Calendar.
	$: activeHref = (() => {
		const path = $page.url.pathname;
		const matches = navItems.filter(
			(item) => path === item.href || path.startsWith(item.href + '/')
		);
		if (matches.length === 0) return null;
		return matches.reduce((a, b) => (b.href.length > a.href.length ? b : a)).href;
	})();
	$: isActive = (href: string) => activeHref === href;

	function toggleMenu() {
		isOpen = !isOpen;
	}

	function closeMenu() {
		isOpen = false;
	}
</script>

<svelte:window on:click={handleOutsideClick} on:keydown={(e) => e.key === 'Escape' && closeProfileDropdown()} />

<nav class="fixed top-0 z-50 w-full border-b border-slate-200 bg-white/95 backdrop-blur-sm print:hidden" style="padding-top: env(safe-area-inset-top)">
	<div class="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
		<div class="flex items-center gap-2">
			<a href="/" class="flex items-center gap-2">
				<svg class="h-8 w-8 text-primary-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<rect x="3" y="4" width="18" height="18" rx="2" />
					<line x1="16" y1="2" x2="16" y2="6" />
					<line x1="8" y1="2" x2="8" y2="6" />
					<line x1="3" y1="10" x2="21" y2="10" />
				</svg>
				<span class="text-xl font-bold text-slate-800">Family Planz</span>
			</a>
		</div>
		<div class="hidden md:flex items-center gap-6">
			{#each navItems as item}
				<a
					href={item.href}
					class="text-sm font-medium transition-colors
						{isActive(item.href)
							? 'text-primary-600'
							: 'text-slate-600 hover:text-slate-900'}"
				>
					{item.label}
				</a>
			{/each}
		</div>
		<div class="hidden md:flex items-center gap-3">
			{#if isLoggedIn}
				<NotificationBell />
				<div class="relative" data-testid="profile-dropdown-container">
					<button
						on:click={toggleProfileDropdown}
						class="flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
						aria-expanded={profileDropdownOpen}
						aria-haspopup="true"
					>
						<div class="flex h-7 w-7 items-center justify-center rounded-full bg-primary-600 text-white text-xs font-bold">
							{user?.firstName?.[0] || user?.email?.[0] || 'U'}
						</div>
						<span class="max-w-32 truncate">{user?.firstName || 'User'}</span>
						<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
						</svg>
					</button>
					{#if profileDropdownOpen}
						<div transition:slide={{ duration: 150 }} class="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-slate-200 bg-white py-2 shadow-lg">
							{#if user?.email}
								<div class="border-b border-slate-100 px-4 pb-2">
									<p class="truncate text-sm font-medium text-slate-900">{user.firstName} {user.lastName}</p>
									<p class="truncate text-xs text-slate-500">{user.email}</p>
								</div>
							{/if}
							{#if user?.roles?.includes?.('admin')}
								<a href="/admin/nlp" on:click={closeProfileDropdown} class="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
									Admin
								</a>
							{/if}
							<a href="/account" on:click={closeProfileDropdown} class="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
								Settings
							</a>
							<a href="/family" on:click={closeProfileDropdown} class="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
								Family Management
							</a>
							<a href="/calendar/stats" on:click={closeProfileDropdown} class="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
								Task Stats
							</a>
							<a href="/calendar/archive" on:click={closeProfileDropdown} class="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
								Archive
							</a>
							<div class="border-t border-slate-100 mt-2 pt-2">
								<form action="/api/logout" method="POST">
									<button type="submit" class="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50">
										Logout
									</button>
								</form>
							</div>
						</div>
					{/if}
				</div>
			{:else}
				<a href="/login" class="text-sm font-medium text-slate-600 hover:text-slate-900">
					Sign In
				</a>
				<a href="/signup" class="rounded-full bg-primary-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-700">
					Get Started
				</a>
			{/if}
		</div>

		<button
			on:click={toggleMenu}
			class="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden"
		>
			<span class="sr-only">Open menu</span>
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
		<div transition:slide={{ duration: 200 }} class="border-t border-slate-200 bg-white md:hidden">
			<div class="space-y-1 px-3 py-3">
				{#if isLoggedIn}
					<div class="flex items-center justify-end border-b border-slate-200 pb-2">
						<NotificationBell />
					</div>
				{/if}
				{#each navItems as item}
					<a
						href={item.href}
						on:click={closeMenu}
						class="block rounded-lg px-3 py-2.5 text-base font-medium transition-colors
							{isActive(item.href)
								? 'bg-primary-100 text-primary-700'
								: 'text-slate-600 hover:bg-slate-100'}"
					>
						{item.label}
					</a>
				{/each}
				<div class="mt-4 flex flex-col gap-2 border-t border-slate-200 pt-3">
					{#if isLoggedIn}
						<form action="/api/logout" method="POST" class="block">
							<button type="submit" class="w-full rounded-lg bg-primary-600 px-3 py-2.5 text-center text-base font-medium text-white">
								Logout
							</button>
						</form>
					{:else}
						<a href="/login" on:click={closeMenu} class="block rounded-lg border border-slate-300 px-3 py-2.5 text-center text-base font-medium text-slate-700">
							Sign In
						</a>
						<a href="/signup" on:click={closeMenu} class="block rounded-lg bg-primary-600 px-3 py-2.5 text-center text-base font-medium text-white">
							Get Started
						</a>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</nav>