<script lang="ts">
	interface Props {
		openCount: number;
		completedCount: number;
		warnings: string[];
	}

	let { openCount, completedCount, warnings }: Props = $props();
</script>

<!-- Header card (family-hub hero pattern) -->
<section
	class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
	aria-labelledby="tasks-heading"
>
	<div class="min-w-0">
		<h1 id="tasks-heading" class="text-xl font-bold text-slate-900">Tasks</h1>
		<p class="mt-0.5 text-xs text-slate-400">
			{openCount}
			{openCount === 1 ? 'task' : 'tasks'} open · {completedCount} completed
		</p>
	</div>
</section>

{#if warnings.length > 0}
	<div
		class="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
		role="alert"
	>
		Couldn't load {warnings.join(', ')} just now — everything else is up to date.
	</div>
{/if}
