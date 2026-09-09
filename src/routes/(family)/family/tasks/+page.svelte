<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import {
		showRecurringCompleteFeedback,
		showRecurringSkipFeedback
	} from '$lib/client/taskFeedback';
	import { pushToast } from '$lib/client/toasts';
	import FamilyTaskRow from '$lib/components/tasks/FamilyTaskRow.svelte';
	import FamilyOpenTaskRow from '$lib/components/tasks/FamilyOpenTaskRow.svelte';
	import FamilyCompletedTaskList from '$lib/components/tasks/FamilyCompletedTaskList.svelte';
	import TaskTagFilter from '$lib/components/tasks/TaskTagFilter.svelte';
	import {
		advanceTask,
		deleteTask,
		matchesTagFilter,
		nameOf,
		respondToTask,
		toggleTask
	} from '$lib/utils/familyTaskActions';

	export let data: PageData;

	type FamilyTask = {
		id: string;
		title: string;
		notes: string | null;
		dueDate: string | null;
		completedAt: string | null;
		recurrenceFrequency?: string | null;
		recurrenceInterval?: number | null;
		completionCount?: number | null;
		assignedTo?: string | null;
		assignmentStatus?: string | null;
		assigneeFirstName?: string | null;
		assigneeLastName?: string | null;
		userId: string;
		creatorFirstName?: string | null;
		tags?: string[];
	};

	let busyId: string | null = null;
	let tagFilter = '';
	/** Inline delete confirmation (matches the family-member remove pattern). */
	let confirmDeleteId: string | null = null;
	/** Issue 019: Family tasks vs the family's Public tasks tab. */
	let tab: 'family' | 'public' = 'family';

	$: publicTasks = data.publicTasks ?? [];

	$: openTasks = data.tasks.filter((t) => !t.completedAt && matchesTagFilter(t, tagFilter));
	$: completedTasks = data.tasks.filter((t) => t.completedAt && matchesTagFilter(t, tagFilter));
	$: pendingForMe = openTasks.filter(
		(t) => t.assignedTo === data.userId && t.assignmentStatus === 'pending'
	);

	function isOverdue(task: FamilyTask): boolean {
		if (!task.dueDate || task.completedAt) return false;
		return new Date(task.dueDate).getTime() < Date.now();
	}

	function formatDue(due: string | null): string {
		if (!due) return '';
		const dt = new Date(due);
		return isNaN(dt.getTime())
			? ''
			: dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	async function toggle(task: FamilyTask) {
		if (busyId) return;
		const previousDueDate = task.dueDate;
		busyId = task.id;
		const out = await toggleTask(task);
		if (out.ok) {
			await invalidateAll();
			showRecurringCompleteFeedback(out.task, previousDueDate);
		} else {
			pushToast({ message: out.error });
		}
		busyId = null;
	}

	async function advance(task: FamilyTask) {
		if (busyId) return;
		busyId = task.id;
		const out = await advanceTask(task);
		if (out.ok) {
			await invalidateAll();
			showRecurringSkipFeedback(out.task);
		} else {
			pushToast({ message: out.error });
		}
		busyId = null;
	}

	async function respond(task: FamilyTask, accept: boolean) {
		if (busyId) return;
		busyId = task.id;
		const out = await respondToTask(task, accept);
		if (out.ok) {
			pushToast({
				message: accept
					? `Accepted "${task.title}" — it's on your list.`
					: `Declined "${task.title}".`
			});
			await invalidateAll();
		} else {
			pushToast({ message: out.error });
		}
		busyId = null;
	}

	async function remove(task: FamilyTask) {
		if (busyId || task.userId !== data.userId) return;
		busyId = task.id;
		const out = await deleteTask(task);
		if (out.ok) {
			pushToast({ message: `Deleted "${task.title}".` });
			await invalidateAll();
		} else {
			pushToast({ message: out.error });
		}
		busyId = null;
		confirmDeleteId = null;
	}
</script>

<div class="mx-auto max-w-2xl p-6">
	<div class="mb-6">
		<a href="/family" class="text-sm text-slate-500 hover:text-slate-700">← Family</a>
		<div class="mt-1 flex items-center justify-between">
			<h1 class="text-2xl font-bold text-slate-900">Family Tasks</h1>
			<a
				href="/calendar/tasks"
				class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
			>
				My tasks
			</a>
		</div>
		{#if pendingForMe.length > 0}
			<p class="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
				📋 {pendingForMe.length} task{pendingForMe.length === 1 ? '' : 's'} waiting for your response
				below.
			</p>
		{/if}
	</div>

	<!-- Issue 019: Family tasks / Public tasks tabs -->
	<div class="mb-4 flex gap-1.5" role="tablist" aria-label="Task lists">
		<button
			type="button"
			role="tab"
			aria-selected={tab === 'family'}
			onclick={() => (tab = 'family')}
			class="min-h-[44px] flex-1 rounded-full border px-3.5 text-sm font-medium transition-colors {tab ===
			'family'
				? 'border-slate-900 bg-slate-900 text-white'
				: 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'}"
		>
			Family tasks
		</button>
		<button
			type="button"
			role="tab"
			aria-selected={tab === 'public'}
			onclick={() => (tab = 'public')}
			class="min-h-[44px] flex-1 rounded-full border px-3.5 text-sm font-medium transition-colors {tab ===
			'public'
				? 'border-slate-900 bg-slate-900 text-white'
				: 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'}"
		>
			Public tasks ({publicTasks.length})
		</button>
	</div>

	{#if tab === 'family'}
		<TaskTagFilter bind:tagFilter />

		{#if openTasks.length === 0 && completedTasks.length === 0}
			{#if tagFilter.trim()}
				<div class="flex flex-col items-center justify-center py-16 text-center">
					<p class="text-lg font-medium text-slate-700">
						No tasks match #<span class="font-semibold">{tagFilter.trim().toLowerCase()}</span>
					</p>
					<p class="text-sm text-slate-500">Clear the filter to see all tasks</p>
				</div>
			{:else}
				<div class="flex flex-col items-center justify-center py-16 text-center">
					<p class="text-lg font-medium text-slate-700">No family tasks yet</p>
					<p class="text-sm text-slate-500">
						Create one from <a href="/calendar/tasks" class="font-medium text-primary-600 underline"
							>My Tasks</a
						>
						and assign it to a family member.
					</p>
				</div>
			{/if}
		{/if}

		{#if openTasks.length === 0 && completedTasks.length > 0 && !tagFilter.trim()}
			<div class="rounded-xl border border-dashed border-slate-200 py-10 text-center">
				<p class="text-sm font-medium text-emerald-600">All caught up 🎉</p>
				<p class="text-sm text-slate-500">Nothing open right now</p>
			</div>
		{/if}

		<div class="space-y-1.5">
			{#each openTasks as task (task.id)}
				<FamilyOpenTaskRow
					{task}
					currentUserId={data.userId}
					busy={busyId === task.id}
					confirmDelete={confirmDeleteId === task.id}
					onToggle={() => toggle(task)}
					onAccept={() => respond(task, true)}
					onDecline={() => respond(task, false)}
					onAdvance={() => advance(task)}
					onBeginDelete={() => (confirmDeleteId = task.id)}
					onCancelDelete={() => (confirmDeleteId = null)}
					onDelete={() => remove(task)}
				/>
			{/each}
		</div>

		<FamilyCompletedTaskList tasks={completedTasks} />
	{:else}
		<!-- Public tasks tab (issue 019): members' public personal tasks, read-only -->
		{#if publicTasks.length === 0}
			<div class="flex flex-col items-center justify-center py-16 text-center">
				<p class="text-lg font-medium text-slate-700">No public tasks yet</p>
				<p class="text-sm text-slate-500">Tasks your family marks public (🌐) show up here.</p>
			</div>
		{:else}
			<div class="space-y-1.5">
				{#each publicTasks as task (task.id)}
					<FamilyTaskRow
						{task}
						variant="public"
						currentUserId={data.userId}
						canComplete={false}
						completeTitle=""
						assigneeName=""
						overdue={isOverdue(task)}
						busy={false}
						onToggle={() => {}}
						onAccept={() => {}}
						onDecline={() => {}}
						onAdvance={() => {}}
						onDelete={() => {}}
					/>
				{/each}
			</div>
		{/if}
	{/if}
</div>
