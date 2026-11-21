<!--
	The admin area's frame: header, the two section tabs with their open-count
	badges, "← Back to app", the page body and the one Toaster. Legacy
	`src/routes/(admin)/+layout.svelte` is the reference for the markup and
	copy; the destinations come from `ADMIN_SECTIONS` instead of being written
	out again here.

	`pathname` is a prop, not `$app/state`: components take data, so the shell
	renders in tests without a router. The counts are optional because the
	legacy layout rendered `0` for a missing count (`?? 0`).

	Doc: ../README.md#invariants
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import Toaster from '$lib/kernel/ui/Toaster.svelte';
	import { ADMIN_SECTIONS, isAdminSectionActive } from '../admin.sections.rules';
	import { adminToasts } from '../admin.toasts.state.svelte.js';
	import type { AdminCounts } from '../admin.contract';

	interface Props {
		/** The current path, for the tabs' active state (`/admin/bugs/42` keeps the bug tab active). */
		pathname: string;
		openBugs?: number;
		openPhrases?: number;
		children: Snippet;
	}

	let { pathname, openBugs = 0, openPhrases = 0, children }: Props = $props();

	const counts: AdminCounts = $derived({ openBugs, openPhrases });
</script>

<div class="min-h-screen bg-slate-50">
	<header class="border-b border-slate-200 bg-white">
		<div class="mx-auto flex max-w-4xl flex-wrap items-center gap-2 px-4 py-3">
			<a href="/admin" class="mr-2 text-sm font-bold text-slate-900" aria-label="Admin home">
				🛠 Admin
			</a>
			<nav class="flex items-center gap-1" aria-label="Admin sections">
				{#each ADMIN_SECTIONS as section (section.href)}
					{@const active = isAdminSectionActive(pathname, section.href)}
					<a
						href={section.href}
						aria-current={active ? 'page' : undefined}
						class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors {active
							? 'bg-slate-900 text-white'
							: 'text-slate-600 hover:bg-slate-100'}"
					>
						{section.label}
						<span
							class="rounded-full px-1.5 py-0.5 text-[11px] font-bold {active
								? 'bg-white/20 text-white'
								: section.badge}"
						>
							{counts[section.countKey]}
						</span>
					</a>
				{/each}
			</nav>
			<a
				href="/calendar"
				class="ml-auto rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
			>
				← Back to app
			</a>
		</div>
	</header>
	{@render children()}
	<Toaster items={adminToasts.items} ondismiss={adminToasts.dismiss} />
</div>
