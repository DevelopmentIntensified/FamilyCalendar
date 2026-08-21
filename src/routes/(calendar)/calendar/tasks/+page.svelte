<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';

	export let data: PageData;

	type TaskItem = {
		id: string;
		title: string;
		notes: string | null;
		dueDate: string | null;
		completedAt: string | null;
	};

	let newTitle = '';
	let newDueDate = '';
	let adding = false;
	let busyId: string | null = null;

	$: openTasks = (data.tasks as TaskItem[]).filter((t) => !t.completedAt);
	$: completedTasks = (data.tasks as TaskItem[]).filter((t) => t.completedAt);

	function formatDue(due: string | null): string {
		if (!due) return '';
		const dt = new Date(due);
		if (isNaN(dt.getTime())) return '';
		return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	function isOverdue(task: TaskItem): boolean {
		if (!task.dueDate || task.completedAt) return false;
		return new Date(task.dueDate).getTime() < Date.now();
	}

	async function addTask() {
		if (!newTitle.trim()) return;
		adding = true;
		try {
			const res = await fetch('/api/tasks', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: newTitle.trim(), dueDate: newDueDate || null })
			});
			if (res.ok) {
				newTitle = '';
				newDueDate = '';
				await invalidateAll();
			}
		} finally {
			adding = false;
		}
	}

	async function toggleTask(id: string) {
		busyId = id;
		try {
			await fetch(`/api/tasks/${id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ toggleComplete: true })
			});
			await invalidateAll();
		} finally {
			busyId = null;
		}
	}

	async function deleteTask(id: string) {
		busyId = id;
		try {
			await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
			await invalidateAll();
		} finally {
			busyId = null;
		}
	}
</script>

<div class="mx-auto max-w-2xl p-6">
	<h1 class="mb-6 text-2xl font-bold text-slate-900">Tasks</h1>

	<!-- Add task -->
	<form
		onsubmit={(e) => {
			e.preventDefault();
			addTask();
		}}
		class="mb-6 flex flex-col gap-2 sm:flex-row"
	>
		<input
			type="text"
			bind:value={newTitle}
			placeholder="Add a task..."
			class="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
		/>
		<input
			type="date"
			bind:value={newDueDate}
			aria-label="Due date"
			class="rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-600"
		/>
		<button
			type="submit"
			disabled={adding || !newTitle.trim()}
			class="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
		>
			Add
		</button>
	</form>

	{#if openTasks.length === 0 && completedTasks.length === 0}
		<div class="flex flex-col items-center justify-center py-16 text-center">
			<svg class="mb-4 h-14 w-14 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
			</svg>
			<p class="text-lg font-medium text-slate-700">No tasks yet</p>
			<p class="text-sm text-slate-500">Add your first task above</p>
		</div>
	{/if}

	<!-- Open tasks -->
	<div class="space-y-1.5">
		{#each openTasks as task (task.id)}
			<div
				class="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 transition-all hover:border-slate-300"
			>
				<button
					type="button"
					onclick={() => toggleTask(task.id)}
					disabled={busyId === task.id}
					class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-slate-300 transition-colors hover:border-primary-500"
					aria-label="Complete task"
				></button>
				<div class="min-w-0 flex-1">
					<p class="truncate text-sm font-medium text-slate-900">{task.title}</p>
					{#if task.notes}
						<p class="truncate text-xs text-slate-500">{task.notes}</p>
					{/if}
				</div>
				{#if task.dueDate}
					<span class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium {isOverdue(task) ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}">
						{formatDue(task.dueDate)}
					</span>
				{/if}
				<button
					type="button"
					onclick={() => deleteTask(task.id)}
					disabled={busyId === task.id}
					class="shrink-0 rounded-full p-1.5 text-slate-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
					aria-label="Delete task"
				>
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
					</svg>
				</button>
			</div>
		{/each}
	</div>

	<!-- Completed -->
	{#if completedTasks.length > 0}
		<h2 class="mb-2 mt-8 text-xs font-semibold uppercase tracking-wide text-slate-400">
			Completed ({completedTasks.length})
		</h2>
		<div class="space-y-1.5">
			{#each completedTasks as task (task.id)}
				<div class="group flex items-center gap-3 rounded-xl bg-slate-50 p-3">
					<button
						type="button"
						onclick={() => toggleTask(task.id)}
						disabled={busyId === task.id}
						class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-500 text-white"
						aria-label="Mark incomplete"
					>
						<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
							<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
						</svg>
					</button>
					<p class="min-w-0 flex-1 truncate text-sm text-slate-400 line-through">{task.title}</p>
					<button
						type="button"
						onclick={() => deleteTask(task.id)}
						disabled={busyId === task.id}
						class="shrink-0 rounded-full p-1.5 text-slate-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
						aria-label="Delete task"
					>
						<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
						</svg>
					</button>
				</div>
			{/each}
		</div>
	{/if}
</div>
