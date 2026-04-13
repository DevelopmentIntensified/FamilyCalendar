<script lang="ts">
	import { page } from '$app/stores';
	import { slide } from 'svelte/transition';
	import calendarIcon from '$lib/assets/svgs/calendar-note-date-svgrepo-com.svg';

	export let isLoggedIn = false;

	let isOpen = false;

	const marketingNavItems = [
		{ href: '/', label: 'Home' },
		{ href: '/about', label: 'About' },
		{ href: '/pricing', label: 'Pricing' },
		{ href: '/contact', label: 'Contact' }
	];

	const loggedInNavItems = [
		{ href: '/calendar', label: 'Calendar' },
		{ href: '/calendar/event/new', label: 'New Event' },
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

<nav class="fixed top-0 z-50 w-full border-b border-gray-200 bg-white/95 backdrop-blur-sm">
	<div class="mx-auto max-w-7xl px-3 sm:px-4 lg:px-5">
		<div class="flex h-16 items-center justify-between">
			<div class="flex items-center gap-3">
				<a href="/" class="flex items-center gap-2">
					<img class="h-10 w-10" src={calendarIcon} alt="FamilyPlanz" />
					<span class="text-xl font-bold text-gray-900">FamilyPlanz</span>
				</a>
			</div>

			<div class="hidden md:block">
				<div class="flex items-center gap-1">
					{#each navItems as item}
						<a
							href={item.href}
							class="rounded-lg px-3 py-2 text-sm font-medium transition-colors
								{isActive(item.href)
									? 'bg-primary-100 text-primary-700'
									: 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}"
						>
							{item.label}
						</a>
					{/each}
				</div>
			</div>

			<div class="hidden md:flex items-center gap-3">
				{#if isLoggedIn}
					<a href="/account" class="rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200">
						My Account
					</a>
					<form action="/api/logout" method="POST">
						<button type="submit" class="rounded-full bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">
							Logout
						</button>
					</form>
				{:else}
					<a href="/login" class="text-sm font-medium text-gray-600 hover:text-gray-900">
						Login
					</a>
					<a href="/signup" class="rounded-full bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">
						Sign Up
					</a>
				{/if}
			</div>

			<button
				on:click={toggleMenu}
				class="rounded-lg p-2 text-gray-600 hover:bg-gray-100 md:hidden"
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
	</div>

	{#if isOpen}
		<div transition:slide={{ duration: 200 }} class="border-t border-gray-200 bg-white md:hidden">
			<div class="space-y-1 px-3 py-3">
				{#each navItems as item}
					<a
						href={item.href}
						on:click={closeMenu}
						class="block rounded-lg px-3 py-2.5 text-base font-medium transition-colors
							{isActive(item.href)
								? 'bg-primary-100 text-primary-700'
								: 'text-gray-600 hover:bg-gray-100'}"
					>
						{item.label}
					</a>
				{/each}
				<div class="mt-4 flex flex-col gap-2 border-t border-gray-200 pt-3">
					{#if isLoggedIn}
						<a href="/account" on:click={closeMenu} class="block rounded-lg bg-gray-100 px-3 py-2.5 text-center text-base font-medium text-gray-700">
							My Account
						</a>
						<form action="/api/logout" method="POST" class="block">
							<button type="submit" class="w-full rounded-lg bg-primary-600 px-3 py-2.5 text-center text-base font-medium text-white">
								Logout
							</button>
						</form>
					{:else}
						<a href="/login" on:click={closeMenu} class="block rounded-lg border border-gray-300 px-3 py-2.5 text-center text-base font-medium text-gray-700">
							Login
						</a>
						<a href="/signup" on:click={closeMenu} class="block rounded-lg bg-primary-600 px-3 py-2.5 text-center text-base font-medium text-white">
							Sign Up
						</a>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</nav>