<script lang="ts">
	import { nameOf } from '$lib/utils/familyTaskActions';

	interface Props {
		tasks: {
			id: string;
			title: string;
			tags?: string[] | null;
			assignedTo?: string | null;
			assigneeFirstName?: string | null;
			assigneeLastName?: string | null;
		}[];
	}

	let { tasks }: Props = $props();
</script>

{#if tasks.length > 0}
	<h2 class="mb-2 mt-8 text-xs font-semibold uppercase tracking-wide text-slate-400">
		Completed ({tasks.length})
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
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
				</svg>
				<div class="min-w-0 flex-1">
					<p class="truncate text-sm text-slate-400 line-through">{task.title}</p>
					{#if task.tags?.length}
						<div class="mt-1 flex flex-wrap items-center gap-1">
							{#each task.tags as tag (tag)}
								<span
									class="rounded-full bg-sky-100/60 px-1.5 py-0.5 text-[10px] font-medium text-sky-600"
									>#{tag}</span
								>
							{/each}
						</div>
					{/if}
				</div>
				{#if task.assignedTo}
					<span class="shrink-0 text-xs text-slate-400">
						{nameOf(task.assigneeFirstName, task.assigneeLastName, task.assignedTo).split(' ')[0]}
					</span>
				{/if}
			</div>
		{/each}
	</div>
{/if}
