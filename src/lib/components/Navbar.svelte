<script lang="ts">
	import { page } from '$app/stores';
	import { slide } from 'svelte/transition';

	export let isLoggedIn = false;

	let isOpen = false;

	const marketingNavItems = [
		{ href: '/about', label: 'About' },
		{ href: '/pricing', label: 'Pricing' },
		{ href: '/contact', label: 'Contact' }
	];

	const loggedInNavItems = [
		{ href: '/calendar', label: 'Calendar' },
		{ href: '/calendar/settings', label: 'Settings' },
		{ href: '/account', label: 'Account' },
		{ href: '/family', label: 'Family' }
	];

	$: navItems = isLoggedIn ? loggedInNavItems : marketingNavItems;
	$: isActive = (href: string) => $page.url.pathname === href || $page.url.pathname.startsWith(href + '/');

	function toggleMenu() {
		isOpen = !isOpen;
	}

	function closeMenu() {
		isOpen = false;
	}
</script>

<nav class="fixed top-0 z-50 w-full border-b border-slate-200 bg-white/95 backdrop-blur-sm">
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
				<a href="/account" class="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200">
					My Account
				</a>
				<form action="/api/logout" method="POST">
					<button type="submit" class="rounded-full bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">
						Logout
					</button>
				</form>
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
						<a href="/account" on:click={closeMenu} class="block rounded-lg bg-slate-100 px-3 py-2.5 text-center text-base font-medium text-slate-700">
							My Account
						</a>
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