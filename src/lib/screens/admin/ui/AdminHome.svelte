<!--
	The `/admin` index body: heading, subtitle and the two section cards.
	Legacy `src/routes/(admin)/admin/+page.svelte` is the reference for the
	copy; the destinations, icons, blurbs and badge colours come from
	`ADMIN_SECTIONS`, so a card and its tab cannot drift apart. The page's
	`<title>` stays in the route.

	Counts are optional and render `0` when missing (legacy `?? 0`).

	Doc: ../README.md#invariants
-->
<script lang="ts">
	import type { AdminCounts } from '../admin.contract';
	import { ADMIN_SECTIONS } from '../admin.sections.rules';

	interface Props {
		openBugs?: number;
		openPhrases?: number;
	}

	let { openBugs = 0, openPhrases = 0 }: Props = $props();

	const counts: AdminCounts = $derived({ openBugs, openPhrases });
</script>

<div class="px-4 py-8">
	<div class="mx-auto max-w-4xl">
		<h1 class="mb-2 text-2xl font-bold text-slate-900">Admin</h1>
		<p class="mb-6 text-sm text-slate-500">Triage user feedback and parser gaps.</p>
		<div class="grid gap-4 sm:grid-cols-2">
			{#each ADMIN_SECTIONS as section (section.href)}
				<a
					href={section.href}
					class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
				>
					<div class="flex items-center justify-between">
						<h2 class="text-base font-semibold text-slate-900">{section.icon} {section.label}</h2>
						<span class="rounded-full {section.badge} px-2 py-0.5 text-xs font-bold">
							{counts[section.countKey]} open
						</span>
					</div>
					<p class="mt-1 text-sm text-slate-500">{section.blurb}</p>
				</a>
			{/each}
		</div>
	</div>
</div>
