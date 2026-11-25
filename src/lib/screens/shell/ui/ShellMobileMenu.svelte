<!--
	The phone menu (md:hidden): a bell row for a signed-in person, the destination
	list with the active highlight, the account rows and admin links, then Logout
	or Sign In + Get Started.

	It now traps focus while open — the legacy component imported the action but
	never applied it, so the menu was the only overlay a keyboard could tab out
	of (ported-sheet Notes, "probably accidental"). Alerts is absent from the list
	because the bell row represents it (the desktop header's `bellInstead` rule).

	Doc: ../README.md#invariants
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { slide } from 'svelte/transition';
	import { trapFocus } from '$lib/kernel/ui/trapFocus';
	import { shellNavItems } from '../shell.nav.rules';
	import type { ShellUserSummary } from '../shell.contract';

	interface Props {
		user: ShellUserSummary | null;
		/** The full href `shellActiveHref` answered, so a subroute keeps its tab lit. */
		activeHref: string | null;
		reportBugHref: string;
		/** Alerts' bell, handed in by the navbar so this file does not import alerts' ui. */
		bell?: Snippet;
		onNavigate: () => void;
		onLogoutSubmit: () => void;
	}

	let { user, activeHref, reportBugHref, bell, onNavigate, onLogoutSubmit }: Props = $props();

	const destinations = shellNavItems.filter((item) => !item.bellInstead);
	const isLoggedIn = $derived(user !== null);
</script>

<div
	use:trapFocus
	transition:slide|global={{ duration: 200 }}
	class="border-t border-slate-200 bg-white md:hidden"
	data-testid="shell-mobile-menu"
>
	<div class="space-y-1 px-3 py-3">
		{#if isLoggedIn && bell}
			<div class="flex items-center justify-end border-b border-slate-200 pb-2">
				{@render bell()}
			</div>
		{/if}
		{#each destinations as item (item.href)}
			<a
				href={item.href}
				data-sveltekit-preload-data="hover"
				onclick={onNavigate}
				class="block rounded-lg px-3 py-2.5 text-base font-medium transition-colors {activeHref ===
				item.href
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
					class="block rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
					>Task Stats</a
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
				{#if user?.isAdmin}
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
