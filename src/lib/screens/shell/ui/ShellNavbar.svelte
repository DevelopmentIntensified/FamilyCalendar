<!--
	The app header: wordmark → `/`, the desktop destination links, the bell slot,
	the avatar dropdown and the phone hamburger with its slide-down menu.

	Navigation is the prop `pathname`: any completed navigation closes BOTH menus
	(issue 253: a bell goto or a tab tap used to leave them open), and Escape or an
	outside click closes the profile dropdown. The legacy component learned that
	from `afterNavigate`; a prop keeps this file free of `$app/*` so it renders in
	tests (port-ui §Components).

	The bell itself is alerts' component, handed in as a snippet — shell owns the
	slot, alerts owns the panel, the feed and push. `reportBugHref` comes from
	kernel's link rule with the current path and search (issue 257), and is
	required by both menus.

	Doc: ../README.md#invariants
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { reportBugHref } from '$lib/kernel/ui/bugReportLink';
	import BrandMark from '$lib/kernel/ui/BrandMark.svelte';
	import type { ShellUserSummary } from '../shell.contract';
	import { shellActiveHref, shellNavItems } from '../shell.nav.rules';
	import ShellMobileMenu from './ShellMobileMenu.svelte';
	import ShellProfileMenu from './ShellProfileMenu.svelte';

	interface Props {
		pathname: string;
		/** `page.url.search` — the `?from=` half of the bug link. */
		search: string;
		user: ShellUserSummary | null;
		/** Alerts' bell; absent when no one is signed in. */
		bell?: Snippet;
		/** Purges the service worker's cached authed data on logout (#029 M2). */
		onLogoutSubmit: () => void;
	}

	let { pathname, search, user, bell, onLogoutSubmit }: Props = $props();

	const destinations = shellNavItems.filter((item) => !item.bellInstead);
	const activeHref = $derived(shellActiveHref(pathname));
	const bugHref = $derived(reportBugHref(`${pathname}${search}`));
	const isLoggedIn = $derived(user !== null);

	let mobileOpen = $state(false);
	let profileOpen = $state(false);

	// Issue 253: any navigation closes both menus, not just a menu link's click.
	let lastPath = pathname;
	$effect(() => {
		if (pathname === lastPath) return;
		lastPath = pathname;
		mobileOpen = false;
		profileOpen = false;
	});

	function closeProfileMenu(): void {
		profileOpen = false;
	}

	function closeMenus(): void {
		mobileOpen = false;
		profileOpen = false;
	}

	function handleOutsideClick(event: MouseEvent): void {
		// Non-Element event targets (e.g. document) count as outside clicks.
		const target = event.target instanceof Element ? event.target : null;
		if (!target?.closest('[data-testid="profile-dropdown-container"]')) closeProfileMenu();
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') closeProfileMenu();
	}
</script>

<svelte:window onclick={handleOutsideClick} onkeydown={handleKeydown}></svelte:window>

<nav
	class="fixed top-0 z-50 w-full border-b border-slate-200 bg-white/95 backdrop-blur-sm print:hidden"
	style="padding-top: env(safe-area-inset-top)"
	data-testid="shell-navbar"
>
	<div class="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
		<div class="flex items-center gap-2">
			<a href="/" class="flex items-center gap-2" onclick={closeMenus}>
				<BrandMark class="h-8 w-8 text-primary-600" />
				<span class="text-xl font-bold text-slate-800">Family Planz</span>
			</a>
		</div>
		<div class="hidden items-center gap-6 md:flex">
			{#each destinations as item (item.href)}
				<a
					href={item.href}
					data-sveltekit-preload-data="hover"
					class="text-sm font-medium transition-colors {activeHref === item.href
						? 'text-primary-600'
						: 'text-slate-600 hover:text-slate-900'}"
				>
					{item.label}
				</a>
			{/each}
		</div>
		<div class="hidden items-center gap-3 md:flex">
			{#if isLoggedIn}
				{#if bell}
					{@render bell()}
				{/if}
				<div class="relative" data-testid="profile-dropdown-container">
					<button
						onclick={() => (profileOpen = !profileOpen)}
						class="flex items-center gap-2 rounded-full bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
						aria-expanded={profileOpen}
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
					{#if profileOpen}
						<ShellProfileMenu
							{user}
							reportBugHref={bugHref}
							onNavigate={closeProfileMenu}
							{onLogoutSubmit}
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
			onclick={() => (mobileOpen = !mobileOpen)}
			class="flex h-11 w-11 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 md:hidden"
		>
			<span class="sr-only">{mobileOpen ? 'Close menu' : 'Open menu'}</span>
			{#if mobileOpen}
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

	{#if mobileOpen}
		<ShellMobileMenu
			{user}
			{activeHref}
			reportBugHref={bugHref}
			{bell}
			onNavigate={closeMenus}
			{onLogoutSubmit}
		/>
	{/if}
</nav>
