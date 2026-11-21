<!--
	The board's completed list: the "Completed (N)" heading with Q-091's TRUE
	count (the list itself keeps the newest window), then one struck-through row
	per Task with its tags, category and assignee's first name.
	Legacy reference: `components/tasks/FamilyCompletedTaskList.svelte`.
-->
<script lang="ts">
	import Pill from '$lib/kernel/ui/Pill.svelte';
	import type { FamilyBoardTask } from '../familyHub.contract';

	interface Props {
		tasks: readonly FamilyBoardTask[];
		/** Every completed Task the read found, window or not (Q-091). */
		total: number;
	}

	let { tasks, total }: Props = $props();

	function assigneeFirstName(task: FamilyBoardTask): string {
		const name = [task.assigneeFirstName, task.assigneeLastName].filter(Boolean).join(' ');
		return name ? name.split(' ')[0] : (task.assignedTo ?? '').slice(0, 8);
	}
</script>

{#if tasks.length > 0}
	<h2 class="mb-2 mt-8 text-xs font-semibold uppercase tracking-wide text-slate-400">
		Completed ({total})
	</h2>
	<div class="space-y-1.5">
		{#each tasks as task (task.id)}
			<div
				class="flex flex-wrap items-center gap-3 overflow-hidden rounded-xl bg-slate-50 p-3 active:bg-slate-100"
			>
				<svg
					class="h-5 w-5 shrink-0 text-emerald-500"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
					aria-hidden="true"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
				</svg>
				<div class="min-w-0 flex-1">
					<p class="truncate text-sm text-slate-400 line-through">{task.title}</p>
					{#if task.tags.length || task.category}
						<div class="mt-1 flex flex-wrap items-center gap-1">
							{#if task.category}
								<Pill tone="categoryMuted" size="compact">{task.category}</Pill>
							{/if}
							{#each task.tags as tag (tag)}
								<Pill tone="accent" size="compact">#{tag}</Pill>
							{/each}
						</div>
					{/if}
				</div>
				{#if task.assignedTo}
					<span class="shrink-0 text-xs text-slate-400">{assigneeFirstName(task)}</span>
				{/if}
			</div>
		{/each}
	</div>
{/if}
