<!--
	The phone menu under the header's hamburger: the bell row, the destination
	list with its active highlight, the account rows, the admin pair, then Logout
	or the guest's Sign In / Get Started pair.

	Focus is trapped while it is open (the shell's mobile menu gained the same
	trap at its own port; the legacy component imported the action but never
	used it). Moved from `src/lib/components/NavbarMobileMenu.svelte` with the
	same markup, roles and copy.

	Doc: ../README.md#invariants
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { slide } from 'svelte/transition';
	import { trapFocus } from '$lib/kernel/ui/trapFocus';
	import type { MarketingNavLink } from '../marketing.content.rules';
	import type { MarketingViewer } from '../marketing.contract';

	interface Props {
		isLoggedIn: boolean;
		user: MarketingViewer | null;
		navItems: readonly MarketingNavLink[];
		activeHref: string | null;
		onNavigate: () => void;
		onLogoutSubmit: () => void;
		/** Issue 257: bug-form link carrying the current page as `?from=`. */
		reportBugHref?: string;
		/** Alerts' bell; absent when no one is signed in. */
		bell?: Snippet;
	}

	let {
		isLoggedIn,
		user,
		navItems,
		activeHref,
		onNavigate,
		onLogoutSubmit,
		reportBugHref = '/report-bug',
		bell
	}: Props = $props();
</script>

<div
	use:trapFocus
	transition:slide={{ duration: 200 }}
	class="border-t border-slate-200 bg-white md:hidden"
>
	<div class="space-y-1 px-3 py-3">
		{#if isLoggedIn && bell}
			<div class="flex items-center justify-end border-b border-slate-200 pb-2">
				{@render bell()}
			</div>
		{/if}
		{#each navItems as item}
			<a
				href={item.href}
				data-sveltekit-preload-data="hover"
				onclick={onNavigate}
				class="block rounded-lg px-3 py-2.5 text-base font-medium transition-colors
					{activeHref === item.href
					? 'bg-primary-100 text-primary-700'
					: 'text-slate-600 hover:bg-slate-100'}"
			>
				{item.label}
			</a>
		{/each}
		{#if isLoggedIn}
			<div class="mt-2 border-t border-slate-200 pt-2">
				<a
					href="/account"
					onclick={onNavigate}
					class="block rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">Settings</a
				>
				<a
					href="/calendar/stats"
					onclick={onNavigate}
					class="block rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">Task Stats</a
				>
				<a
					href="/calendar/archive"
					onclick={onNavigate}
					class="block rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">Archive</a
				>
				<a
					href={reportBugHref}
					onclick={onNavigate}
					class="block rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
					>Report a Bug</a
				>
				{#if user?.roles?.includes?.('admin')}
					<a
						href="/admin/nlp"
						onclick={onNavigate}
						class="block rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">Admin</a
					>
					<a
						href="/admin/bugs"
						onclick={onNavigate}
						class="block rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
						>Bug Reports</a
					>
				{/if}
			</div>
		{/if}
		<div class="mt-4 flex flex-col gap-2 border-t border-slate-200 pt-3">
			{#if isLoggedIn}
				<form action="/api/logout" method="POST" class="block" onsubmit={onLogoutSubmit}>
					<button
						type="submit"
						class="w-full rounded-lg bg-primary-600 px-3 py-2.5 text-center text-base font-medium text-white"
					>
						Logout
					</button>
				</form>
			{:else}
				<a
					href="/login"
					onclick={onNavigate}
					class="block rounded-lg border border-slate-300 px-3 py-2.5 text-center text-base font-medium text-slate-700"
				>
					Sign In
				</a>
				<a
					href="/signup"
					onclick={onNavigate}
					class="block rounded-lg bg-primary-600 px-3 py-2.5 text-center text-base font-medium text-white"
				>
					Get Started
				</a>
			{/if}
		</div>
	</div>
</div>
