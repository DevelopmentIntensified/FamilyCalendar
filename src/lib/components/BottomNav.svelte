<script lang="ts">
	import { page } from '$app/stores';

	const items = [
		{
			href: '/calendar',
			label: 'Calendar',
			icon: '<rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />'
		},
		{
			href: '/calendar/dashboard',
			label: 'Dashboard',
			icon: '<rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />'
		},
		{
			href: '/calendar/tasks',
			label: 'Tasks',
			icon: '<circle cx="12" cy="12" r="9" /><path d="M9 12l2 2 4-4" />'
		},
		{
			href: '/family',
			label: 'Family',
			icon: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />'
		}
	] as const;

	// Longest prefix wins so /calendar/dashboard highlights Dashboard, not Calendar.
	$: path = $page.url.pathname;
	$: active = (() => {
		const matched = items.filter((i) => path === i.href || path.startsWith(i.href + '/'));
		if (matched.length === 0) return null;
		return matched.reduce((a, b) => (b.href.length > a.href.length ? b : a));
	})();
</script>

<nav
	class="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-sm md:hidden print:hidden"
	aria-label="Primary navigation"
>
	<div class="grid grid-cols-4" style="padding-bottom: env(safe-area-inset-bottom)">
		{#each items as item (item.href)}
			{@const on = active?.href === item.href}
			<a
				href={item.href}
				aria-current={on ? 'page' : undefined}
				class="flex min-w-0 flex-col items-center justify-center gap-0.5 py-2"
			>
				<span
					class="flex h-7 min-w-14 items-center justify-center rounded-full transition-colors {on
						? 'bg-primary-50 text-primary-600'
						: 'text-slate-400'}"
				>
					<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<!-- svelte-ignore a11y-invalid-attribute -->
						{@html item.icon}
					</svg>
				</span>
				<span class="text-[11px] font-medium leading-none {on ? 'text-primary-600' : 'text-slate-500'}">
					{item.label}
				</span>
			</a>
		{/each}
	</div>
</nav>