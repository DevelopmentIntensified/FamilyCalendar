<script lang="ts">
	import { slide } from 'svelte/transition';
	import NotificationBell from '$lib/components/NotificationBell.svelte';
	import { trapFocusAction } from '$lib/utils/focusTrap';
	import type { NavItem } from '$lib/utils/navItems';

	interface Props {
		isLoggedIn: boolean;
		user: { roles?: string[] } | null;
		navItems: NavItem[];
		activeHref: string | null;
		onNavigate: () => void;
		onLogoutSubmit: () => void;
	}

	let { isLoggedIn, user, navItems, activeHref, onNavigate, onLogoutSubmit }: Props = $props();
</script>

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
					href="/report-bug"
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
