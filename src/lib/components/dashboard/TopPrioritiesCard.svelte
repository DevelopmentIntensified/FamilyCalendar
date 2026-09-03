<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { showRecurringCompleteFeedback } from '$lib/client/taskFeedback';

	export let tasks: {
		id: string;
		title: string;
		dueDate: string | null;
		priority: string;
		userId: string;
		assignedTo: string | null;
		assignmentStatus: string | null;
		assigneeFirstName?: string | null;
		assigneeLastName?: string | null;
		recurrenceFrequency?: string | null;
		recurrenceInterval?: number | null;
	}[];
	export let meId: string;

	let busy: string | null = null;

	function memberName(t: (typeof tasks)[number]): string {
		if (t.assignedTo === meId) return 'You';
		const name = `${t.assigneeFirstName ?? ''} ${t.assigneeLastName ?? ''}`.trim();
		return name || 'Unassigned';
	}

	function dueLabel(due: string | null): string | null {
		if (!due) return null;
		const d = new Date(due);
		if (isNaN(d.getTime())) return null;
		return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	function dueTone(due: string | null): string {
		if (!due) return '';
		const endOfToday = new Date();
		endOfToday.setHours(23, 59, 59, 999);
		if (new Date(due).getTime() < new Date().setHours(0, 0, 0, 0)) return 'bg-red-100 text-red-700';
		if (new Date(due).getTime() <= endOfToday.getTime()) return 'bg-amber-100 text-amber-700';
		return 'bg-slate-100 text-slate-600';
	}

	const PRIORITY_LABEL: Record<string, string> = { low: 'Low', normal: 'Normal', high: 'High' };
	const PRIORITY_ORDER = ['low', 'normal', 'high'];

	function priorityTone(p: string): string {
		if (p === 'high') return 'bg-rose-100 text-rose-700';
		if (p === 'low') return 'bg-slate-200 text-slate-600';
		return 'bg-sky-100 text-sky-700';
	}

	async function setPriority(taskId: string, priority: string) {
		if (busy) return;
		busy = taskId;
		try {
			await fetch(`/api/tasks/${taskId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ priority })
			});
			await invalidateAll();
		} finally {
			busy = null;
		}
	}

	async function toggleTask(task: (typeof tasks)[number]) {
		if (busy) return;
		busy = task.id;
		try {
			const res = await fetch(`/api/tasks/${task.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ toggleComplete: true })
			});
			if (res.ok) {
				const j = await res.json().catch(() => ({}));
				await invalidateAll();
				showRecurringCompleteFeedback(j.task, task.dueDate);
			}
		} finally {
			busy = null;
		}
	}
</script>

<div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
	<h2 class="mb-3 flex items-center justify-between text-sm font-semibold text-slate-900">
		Top-3 Priorities
		{#if tasks.length === 0}
			<span class="text-xs font-normal text-slate-400">All clear</span>
		{/if}
	</h2>

	{#if tasks.length === 0}
		<p class="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-400">
			Nothing on the plate right now
		</p>
	{:else}
		<ol class="space-y-2">
			{#each tasks as task, i (task.id)}
				<li class="flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-3">
					<span class="w-4 shrink-0 select-none text-center text-xs font-bold text-slate-300">
						{i + 1}
					</span>
					<button
						type="button"
						onclick={() => toggleTask(task)}
						disabled={busy === task.id}
						class="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-slate-300 transition-colors enabled:hover:border-primary-500 disabled:opacity-40"
						title="Mark done"
						aria-label="Mark done: {task.title}"
					><span class="absolute -inset-2" aria-hidden="true"></span></button>
					<div class="min-w-0 flex-1">
						<p class="truncate text-sm font-medium text-slate-900">{task.title}</p>
						<p class="text-[11px] text-slate-400">{memberName(task)}</p>
					</div>
					{#if task.dueDate}
						<span
							class="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium {dueTone(
								task.dueDate
							)}"
						>
							{dueLabel(task.dueDate)}
						</span>
					{/if}
					<div class="flex shrink-0 flex-wrap items-center gap-0.5" title="Priority">
						{#each PRIORITY_ORDER as p (p)}
							<button
								type="button"
								onclick={() => setPriority(task.id, p)}
								disabled={busy === task.id || task.priority === p}
								class="rounded-md px-2 py-1 text-[11px] font-semibold transition-colors {task.priority === p
									? priorityTone(p)
									: 'text-slate-300 hover:bg-slate-100 hover:text-slate-500'}"
								aria-label="Set priority {PRIORITY_LABEL[p]}"
								title="{PRIORITY_LABEL[p]} priority"
							>
								{PRIORITY_LABEL[p]}
							</button>
						{/each}
					</div>
				</li>
			{/each}
		</ol>
	{/if}
	<div class="mt-3 text-right">
		<a
			href="/calendar/tasks"
			class="text-xs font-semibold text-primary-600 hover:text-primary-700 hover:underline"
		>
			View all tasks →
		</a>
	</div>
</div>