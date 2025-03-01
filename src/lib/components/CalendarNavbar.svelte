<script lang="ts">
	import { page } from '$app/stores';
	import { slide } from 'svelte/transition';
	import CodexMenu from 'virtual:icons/codex/menu';

	let isOpen = false;

	let navItems = [
		{ href: '/', label: 'Home' },
		{ href: '/about', label: 'About' },
		{ href: '/pricing', label: 'Pricing' },
		{ href: '/contact', label: 'Contact' }
	];

	function toggleMenu() {
		isOpen = !isOpen;
	}

	function closeMenu() {
		isOpen = false;
	}
</script>

<nav class="l-0 fixed top-0 w-full bg-primary text-white">
	<div class="max-w-7xl px-3 md:px-4 lg:px-5">
		<div class="flex h-16 items-center justify-start">
			<div class="flex items-center">
				<div class="hidden lg:block">
					<div class="ml-10 flex items-baseline space-x-4">
						{#each navItems as item}
							<a
								href={item.href}
								class="rounded-md px-2 py-2 text-sm font-medium hover:bg-primary-800 {$page.url
									.pathname === item.href
									? 'bg-primary-800'
									: ''}"
							>
								{item.label}
							</a>
						{/each}
					</div>
				</div>
			</div>
			<div class="hidden lg:block">
				<div class="ml-4 flex items-center lg:ml-6">
					<form action="/api/logout" class="absolute right-5" method="POST">
						<button
							type="submit"
							class="rounded-md px-3 py-2 text-sm font-medium hover:bg-primary-800">Logout</button
						>
					</form>
				</div>
			</div>
			<div class="w-full lg:hidden">
				<button
					on:click={toggleMenu}
					class="absolute left-5 top-3 inline-flex items-center justify-center rounded-md p-2 text-white hover:bg-primary-800 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
				>
					<span class="sr-only">Open main menu</span>
					{#if isOpen}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-6 w-6"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
					{:else}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-6 w-6"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
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
		</div>
	</div>

	{#if isOpen}
		<div transition:slide={{ duration: 300 }} class="lg:hidden">
			<div class="space-y-1 px-2 pb-3 pt-2 lg:px-3">
				{#each navItems as item}
					<a
						href={item.href}
						on:click={closeMenu}
						class="block rounded-md px-3 py-2 text-center text-base font-medium hover:bg-primary-800 {$page
							.url.pathname === item.href
							? 'bg-primary-800'
							: ''}"
					>
						{item.label}
					</a>
				{/each}
				<form action="/api/logout" method="POST" class="block">
					<button
						type="submit"
						on:click={closeMenu}
						class="w-full rounded-md px-3 py-2 text-center text-base font-medium hover:bg-primary-800"
						>Logout</button
					>
				</form>
			</div>
		</div>
	{/if}
</nav>
