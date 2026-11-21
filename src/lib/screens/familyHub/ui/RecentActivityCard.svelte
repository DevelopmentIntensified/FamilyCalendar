<!--
	The Recent Activity card: one line per item (✅/📋 + the sentence) with its
	relative time on the right, and the empty state.
	Legacy reference: `family/[familyId]/+page.svelte:589-616`.
-->
<script lang="ts">
	import { systemClock } from '$lib/kernel/time/clock';
	import type { FamilyHubState } from '../familyHub.detail.state.svelte';
	import { ACTIVITY_EMPTY_MESSAGE, activityAgo, activityLine } from '../familyHub.detail.rules';

	interface Props {
		state: FamilyHubState;
	}

	let { state }: Props = $props();

	const activity = $derived(state.data.activity);
	// The feed's "2 days ago" is computed once per render, as the legacy
	// `relativeTime` call did; the clock is the kernel port (rule R5).
	const now = systemClock.now();
</script>

<section
	class="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
	aria-labelledby="activity-heading"
>
	<h2 id="activity-heading" class="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
		Recent Activity
	</h2>
	{#if activity.length > 0}
		<ul class="space-y-1.5">
			{#each activity as item, index (index)}
				<li
					class="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-1.5 transition-colors hover:bg-slate-100"
				>
					<span class="min-w-0 flex-1 truncate text-sm text-slate-700">{activityLine(item)}</span>
					<span class="shrink-0 text-xs text-slate-400">{activityAgo(item.at, now)}</span>
				</li>
			{/each}
		</ul>
	{:else}
		<div class="py-6 text-center">
			<p class="text-sm text-slate-500">{ACTIVITY_EMPTY_MESSAGE}</p>
		</div>
	{/if}
</section>
