<!--
	The profile dropdown. Order and copy are the legacy menu's: an optional
	name/email header, the admin-only rows, Settings, Family Management, Task
	Stats, Archive, Report a Bug, then the red Logout in its own bordered block.

	#242: the header is for REGISTERED accounts only. A guest's email is the #196
	placeholder, so rendering it would show a stranger's-looking address to the
	person who is signed in as a guest.

	`reportBugHref` is REQUIRED (the legacy prop silently defaulted to
	`/report-bug`, dropping the `?from=` context a caller forgot). The logout form
	is a plain `POST /api/logout`; `onLogoutSubmit` is where the caller purges the
	service worker's cached authed data (#029 M2).

	Doc: ../README.md#invariants
-->
<script lang="ts">
	import { slide } from 'svelte/transition';
	import { isRegisteredAccount } from '$lib/domains/identity';
	import { trapFocus } from '$lib/kernel/ui/trapFocus';
	import type { ShellUserSummary } from '../shell.contract';

	interface Props {
		user: ShellUserSummary | null;
		/** Feedback's `reportBugHref(path + search)` — never defaulted here. */
		reportBugHref: string;
		onNavigate: () => void;
		onLogoutSubmit: () => void;
	}

	let { user, reportBugHref, onNavigate, onLogoutSubmit }: Props = $props();
</script>

<div
	use:trapFocus
	transition:slide|global={{ duration: 150 }}
	class="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-slate-200 bg-white py-2 shadow-lg"
	data-testid="shell-profile-menu"
>
	{#if isRegisteredAccount(user)}
		<div class="border-b border-slate-100 px-4 pb-2">
			<p class="truncate text-sm font-medium text-slate-900">
				{user.firstName}
				{user.lastName}
			</p>
			<p class="truncate text-xs text-slate-500">{user.email}</p>
		</div>
	{/if}
	{#if user?.isAdmin}
		<a
			href="/admin/nlp"
			onclick={onNavigate}
			class="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Admin</a
		>
		<a
			href="/admin/bugs"
			onclick={onNavigate}
			class="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Bug Reports</a
		>
	{/if}
	<a href="/account" onclick={onNavigate} class="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
		>Settings</a
	>
	<a href="/family" onclick={onNavigate} class="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
		>Family Management</a
	>
	<a
		href="/calendar/stats"
		onclick={onNavigate}
		class="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Task Stats</a
	>
	<a
		href="/calendar/archive"
		onclick={onNavigate}
		class="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Archive</a
	>
	<a href={reportBugHref} onclick={onNavigate} class="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
		>Report a Bug</a
	>
	<div class="mt-2 border-t border-slate-100 pt-2">
		<form action="/api/logout" method="POST" onsubmit={onLogoutSubmit}>
			<button type="submit" class="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50">
				Logout
			</button>
		</form>
	</div>
</div>
