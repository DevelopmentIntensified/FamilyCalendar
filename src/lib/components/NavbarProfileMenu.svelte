<script lang="ts">
	import { slide } from 'svelte/transition';
	import { trapFocusAction } from '$lib/utils/focusTrap';

	interface Props {
		user: {
			firstName?: string;
			lastName?: string;
			email?: string;
			roles?: string[];
		} | null;
		onNavigate: () => void;
		onLogoutSubmit: () => void;
	}

	let { user, onNavigate, onLogoutSubmit }: Props = $props();
</script>

<div
	use:trapFocusAction
	transition:slide={{ duration: 150 }}
	class="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-slate-200 bg-white py-2 shadow-lg"
>
	{#if user?.email}
		<div class="border-b border-slate-100 px-4 pb-2">
			<p class="truncate text-sm font-medium text-slate-900">
				{user.firstName}
				{user.lastName}
			</p>
			<p class="truncate text-xs text-slate-500">{user.email}</p>
		</div>
	{/if}
	{#if user?.roles?.includes?.('admin')}
		<a
			href="/admin/nlp"
			onclick={onNavigate}
			class="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
		>
			Admin
		</a>
		<a
			href="/admin/bugs"
			onclick={onNavigate}
			class="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
		>
			Bug Reports
		</a>
	{/if}
	<a
		href="/account"
		onclick={onNavigate}
		class="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
	>
		Settings
	</a>
	<a
		href="/family"
		onclick={onNavigate}
		class="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
	>
		Family Management
	</a>
	<a
		href="/calendar/stats"
		onclick={onNavigate}
		class="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
	>
		Task Stats
	</a>
	<a
		href="/calendar/archive"
		onclick={onNavigate}
		class="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
	>
		Archive
	</a>
	<a
		href="/report-bug"
		onclick={onNavigate}
		class="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
	>
		Report a Bug
	</a>
	<div class="mt-2 border-t border-slate-100 pt-2">
		<form action="/api/logout" method="POST" onsubmit={onLogoutSubmit}>
			<button type="submit" class="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50">
				Logout
			</button>
		</form>
	</div>
</div>
