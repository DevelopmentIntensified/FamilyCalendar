<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { showRecurringCompleteFeedback } from '$lib/client/taskFeedback';
	import { pushToast } from '$lib/client/toasts';
	import { dueTone, PRIORITY_LABEL, PRIORITY_ORDER, priorityTone } from '$lib/utils/priorityTone';

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
		// Issue 021 parity: scoping fields ride along in the task JSON.
		familyId?: string | null;
		visibility?: 'public' | 'private';
	}[];
	export let meId: string;

	let busy: string | null = null;

	function memberName(t: (typeof tasks)[number]): string {
		if (t.assignedTo === meId) return 'You';
		const name = `${t.assigneeFirstName ?? ''} ${t.assigneeLastName ?? ''}`.trim();
		return name || 'Unassigned';
	}

	/** Assignee display name for the "→ Name" badge, or '' when absent. */
	function assigneeBadge(t: (typeof tasks)[number]): string {
		if (!t.assignedTo || t.assignedTo === meId) return '';
		return `${t.assigneeFirstName ?? ''} ${t.assigneeLastName ?? ''}`.trim();
	}

	function dueLabel(due: string | null): string | null {
		if (!due) return null;
		const d = new Date(due);
		if (isNaN(d.getTime())) return null;
		return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	/** Due/priority tones live in the shared priorityTone module. */

	async function setPriority(taskId: string, priority: string) {
		if (busy) return;
		busy = taskId;
		try {
			const res = await fetch(`/api/tasks/${taskId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ priority })
			});
			if (res.ok) {
				const label =
					priority === 'high'
						? 'High'
						: priority === 'low'
							? 'Low'
							: priority === 'normal'
								? 'Normal'
								: priority;
				pushToast({ message: `Priority set to ${label}.` });
				await invalidateAll();
			} else {
				const j = await res.json().catch(() => ({}));
				pushToast({ message: j.error || "Couldn't set priority — try again." });
			}
		} catch {
			pushToast({ message: "Couldn't set priority — check your connection." });
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
				if (task.recurrenceFrequency) {
					// Recurring path gets ONLY the streak+Undo toast — no generic toast.
					await invalidateAll();
					showRecurringCompleteFeedback(j.task, task.dueDate);
				} else {
					pushToast({ message: `"${task.title}" marked done.` });
					await invalidateAll();
				}
			} else {
				const j = await res.json().catch(() => ({}));
				pushToast({ message: j.error || `Couldn't update "${task.title}" — try again.` });
			}
		} catch {
			pushToast({ message: `Couldn't update "${task.title}" — check your connection.` });
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
		<p
			class="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-400"
		>
			Nothing on the plate right now
		</p>
	{:else}
		<ol class="space-y-2">
			{#each tasks as task, i (task.id)}
				<li
					class="flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-3"
				>
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
						><span class="absolute -inset-2" aria-hidden="true"></span></button
					>
					<div class="min-w-0 flex-1">
						<p class="truncate text-sm font-medium text-slate-900">{task.title}</p>
						{#if assigneeBadge(task)}
							<span
								class="mt-0.5 inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
								title="Assigned to {assigneeBadge(task)}"
							>
								→ {assigneeBadge(task)}
							</span>
						{:else}
							<p class="text-[11px] text-slate-400">{memberName(task)}</p>
						{/if}
						<div class="mt-0.5 flex flex-wrap items-center gap-1">
							{#if task.familyId}
								<span
									class="inline-flex items-center rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700"
									title="Family task"
								>
									Family
								</span>
							{:else}
								<span
									class="inline-flex items-center rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500"
									title={task.visibility === 'private'
										? 'Private — only you and the assignee'
										: 'Public — family can see it (read-only)'}
								>
									{task.visibility === 'private' ? '🔒 Private' : '🌐 Public'}
								</span>
							{/if}
						</div>
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
								class="rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-colors {task.priority ===
								p
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
