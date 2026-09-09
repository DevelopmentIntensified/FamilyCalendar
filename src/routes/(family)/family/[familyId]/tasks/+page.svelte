<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import { avatarColor } from '$lib/utils/avatarColor';
	import { formatDue } from '$lib/utils/taskDisplay';
	import FamilyTaskRow from '$lib/components/tasks/FamilyTaskRow.svelte';
	import FamilyTaskAddForm from '$lib/components/tasks/FamilyTaskAddForm.svelte';
	import FamilyTasksList from '$lib/components/tasks/FamilyTasksList.svelte';
	import FamilyTaskFilterBar from '$lib/components/tasks/FamilyTaskFilterBar.svelte';
	import { sortByCompletedDesc, sortTasks, type TaskSortKey } from '$lib/utils/taskSort';
	import {
		filterTasks,
		groupByAssignee,
		memberName as memberNameOf
	} from '$lib/utils/familyTaskList';
	import {
		showRecurringCompleteFeedback,
		showRecurringSkipFeedback
	} from '$lib/client/taskFeedback';
	import {
		advanceTask as advanceTaskAction,
		deleteTask as deleteTaskAction,
		matchesTagFilter as matchesTagFilterAction,
		respondToTask as respondToTaskAction,
		toggleTask as toggleTaskAction
	} from '$lib/utils/familyTaskActions';

	export let data: PageData;

	type TaskItem = {
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
		priority?: string | null;
		assigneeFirstName?: string | null;
		assigneeLastName?: string | null;
		creatorFirstName?: string | null;
		userId: string;
		eventId: string | null;
		eventTitle?: string | null;
		createdAt?: string | Date | number | null;
		tags?: string[];
	};

	let busyId: string | null = null;
	let tagFilter = '';
	let searchQuery = '';
	let sortBy: TaskSortKey = 'due';
	/** Issue 019: Family tasks vs the family's Public tasks tab. */
	let tab: 'family' | 'public' = 'family';

	$: publicTasks = data.publicTasks ?? [];
	$: members = data.members ?? [];
	$: currentUserId = data.currentUserId;

	onMount(() => {
		const v = localStorage.getItem('familyplanz:tasksSortBy');
		if (v === 'due' || v === 'priority' || v === 'created' || v === 'title') sortBy = v;
		const tf = localStorage.getItem('familyplanz:tagFilter');
		if (tf !== null) tagFilter = tf;
	});
	$: if (typeof localStorage !== 'undefined') {
		localStorage.setItem('familyplanz:tasksSortBy', sortBy);
		localStorage.setItem('familyplanz:tagFilter', tagFilter);
	}

	function memberName(userId: string | null | undefined): string {
		return memberNameOf(userId, members);
	}

	function isOverdue(task: TaskItem): boolean {
		if (!task.dueDate || task.completedAt) return false;
		return new Date(task.dueDate).getTime() < Date.now();
	}

	function canComplete(task: TaskItem): boolean {
		return task.userId === currentUserId || task.assignedTo === currentUserId;
	}

	async function toggleTask(task: TaskItem) {
		busyId = task.id;
		try {
			const out = await toggleTaskAction(task);
			if (out.ok) {
				await invalidateAll();
				showRecurringCompleteFeedback(out.task, task.dueDate);
			}
		} finally {
			busyId = null;
		}
	}

	async function advanceTask(id: string) {
		if (busyId) return;
		busyId = id;
		try {
			const out = await advanceTaskAction({ id, title: id });
			if (out.ok) {
				await invalidateAll();
				showRecurringSkipFeedback(out.task);
			}
		} finally {
			busyId = null;
		}
	}

	async function respondAssignment(task: TaskItem, accept: boolean) {
		if (busyId) return;
		busyId = task.id;
		try {
			if ((await respondToTaskAction(task, accept)).ok) await invalidateAll();
		} finally {
			busyId = null;
		}
	}

	async function deleteTask(id: string) {
		busyId = id;
		try {
			if ((await deleteTaskAction({ id, title: id })).ok) await invalidateAll();
		} finally {
			busyId = null;
		}
	}

	$: filtered = filterTasks(data.tasks, { tagFilter, searchQuery, members });
	$: openTasks = filtered.open;
	$: completedTasks = filtered.completed;
	$: sortedOpenTasks = [...openTasks].sort((a, b) => sortTasks(a, b, sortBy));
	$: sortedCompletedTasks = [...completedTasks].sort(sortByCompletedDesc);
	$: queryActive = searchQuery.trim().length > 0;
	$: filterActive = tagFilter.trim().length > 0 || queryActive;

	// Group sorted open tasks by assignee so everyone sees who's on the hook.
	// Legacy unassigned rows fall into their own bucket.
	$: grouped = groupByAssignee(sortedOpenTasks, members, currentUserId);
	$: byAssignee = grouped.byAssignee;
	$: unassignedTasks = grouped.unassignedTasks;
</script>

<svelte:head>
	<title>Tasks - {data.family?.name || 'Family'} - Family Planz</title>
</svelte:head>

<div class="mx-auto max-w-3xl px-4 py-8">
	<Breadcrumbs
		crumbs={[
			{ label: 'Calendar', href: '/calendar' },
			{ label: 'Family', href: '/family' },
			{ label: data.family?.name || 'Family', href: '/family/{data.family?.id}' },
			{ label: 'Tasks' }
		]}
	/>

	<div class="mb-6 flex flex-wrap items-center justify-between gap-4">
		<div>
			<h1 class="text-2xl font-bold text-slate-900">{data.family?.name} Tasks</h1>
			<p class="text-sm text-slate-500">
				{openTasks.length} open · {completedTasks.length} done
			</p>
		</div>
		<a
			href="/family/{data.family?.id}"
			class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
		>
			Back to Family
		</a>
	</div>

	<!-- Issue 019: Family tasks / Public tasks tabs -->
	<div class="mb-6 flex gap-1.5" role="tablist" aria-label="Task lists">
		<button
			type="button"
			role="tab"
			aria-selected={tab === 'family'}
			onclick={() => (tab = 'family')}
			class="min-h-[44px] flex-1 rounded-full border px-3.5 text-sm font-medium transition-colors sm:flex-none sm:px-5 {tab ===
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
			class="min-h-[44px] flex-1 rounded-full border px-3.5 text-sm font-medium transition-colors sm:flex-none sm:px-5 {tab ===
			'public'
				? 'border-slate-900 bg-slate-900 text-white'
				: 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'}"
		>
			Public tasks ({publicTasks.length})
		</button>
	</div>

	{#if tab === 'family'}
		<FamilyTaskAddForm
			familyId={data.family.id}
			{members}
			{currentUserId}
			{memberName}
			onAdded={() => invalidateAll()}
		/>

		<FamilyTaskFilterBar bind:searchQuery bind:sortBy bind:tagFilter />

		{#if openTasks.length === 0 && completedTasks.length === 0}
			{#if filterActive}
				<div class="rounded-xl border border-dashed border-slate-200 py-10 text-center">
					<p class="text-sm font-medium text-slate-500">No tasks match your search or filters</p>
					<p class="text-sm text-slate-400">Clear the search and filter to see all tasks</p>
				</div>
			{:else}
				<div class="rounded-xl border border-dashed border-slate-200 py-16 text-center">
					<svg
						class="mx-auto mb-4 h-14 w-14 text-slate-300"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="1.5"
							d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
						/>
					</svg>
					<p class="text-lg font-medium text-slate-700">No family tasks yet</p>
					<p class="text-sm text-slate-500">Add the first one above</p>
				</div>
			{/if}
		{:else if openTasks.length === 0}
			<div class="rounded-xl border border-dashed border-slate-200 py-10 text-center">
				<p class="text-sm font-medium text-emerald-600">All caught up 🎉</p>
				<p class="text-sm text-slate-500">Nothing open right now</p>
			</div>
		{/if}

		<FamilyTasksList
			{byAssignee}
			{unassignedTasks}
			{completedTasks}
			{currentUserId}
			{memberName}
			canComplete={(t) => canComplete(t)}
			completeTitle={(t) =>
				canComplete(t)
					? 'Complete task'
					: `Only ${firstName(t.assignedTo)} or the creator can complete this`}
			assigneeName={(t) => firstName(t.assignedTo)}
			overdue={(t) => isOverdue(t)}
			busy={(t) => busyId === t.id}
			onToggle={(t) => toggleTask(t)}
			onAccept={(t) => respondAssignment(t, true)}
			onDecline={(t) => respondAssignment(t, false)}
			onAdvance={(t) => advanceTask(t.id)}
			onDelete={(t) => deleteTask(t.id)}
		/>
	{:else}
		<!-- Public tasks tab (issue 019): members' public personal tasks, read-only -->
		{#if publicTasks.length === 0}
			<div class="rounded-xl border border-dashed border-slate-200 py-16 text-center">
				<p class="text-lg font-medium text-slate-700">No public tasks yet</p>
				<p class="text-sm text-slate-500">Tasks your family marks public (🌐) show up here.</p>
			</div>
		{:else}
			<div class="space-y-1.5">
				{#each publicTasks as task (task.id)}
					<FamilyTaskRow
						{task}
						variant="public"
						{currentUserId}
						canComplete={false}
						completeTitle="Public task — read-only for other members"
						assigneeName={firstName(task.assignedTo)}
						overdue={isOverdue(task)}
						busy={busyId === task.id}
						onToggle={() => toggleTask(task)}
						onAccept={() => respondAssignment(task, true)}
						onDecline={() => respondAssignment(task, false)}
						onAdvance={() => advanceTask(task.id)}
						onDelete={() => deleteTask(task.id)}
					/>
				{/each}
			</div>
		{/if}
	{/if}
</div>
