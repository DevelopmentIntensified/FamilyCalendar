<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import MentionInput from '$lib/components/MentionInput.svelte';
	import TaskQuickAddPreview from '$lib/components/TaskQuickAddPreview.svelte';
	import { avatarColor } from '$lib/utils/avatarColor';
	import { formatDue } from '$lib/utils/taskDisplay';
	import FamilyTaskRow from '$lib/components/tasks/FamilyTaskRow.svelte';
	import { parseTaskQuickAdd, TASK_QUICK_ADD_PRIORITY_RE } from '$lib/utils/taskQuickAdd';
	import { sortByCompletedDesc, sortTasks, type TaskSortKey } from '$lib/utils/taskSort';
	import {
		showRecurringCompleteFeedback,
		showRecurringSkipFeedback
	} from '$lib/client/taskFeedback';

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

	let newTitle = '';
	let newDueDate = '';
	let newAssignedTo = '';
	let newPriority = 'normal';
	let adding = false;
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

	/** Task priority -> dot color class. */
	interface PriorityDots {
		[key: string]: string;
	}
	const PRIORITY_DOT: PriorityDots = {
		high: 'bg-red-500',
		normal: 'bg-slate-300',
		low: 'bg-sky-500'
	};

	function memberName(userId: string | null | undefined): string {
		if (!userId) return 'Unassigned';
		const m = members.find((f) => f.userId === userId);
		if (m) return `${m.firstName} ${m.lastName}`.trim();
		return userId.slice(0, 8);
	}

	function firstName(userId: string | null | undefined): string {
		return memberName(userId).split(' ')[0];
	}

	/** End-of-today ISO slot — used when a recurrence is typed with no due date. */
	function endOfDayIso(): string {
		const d = new Date();
		d.setHours(23, 59, 0, 0);
		return d.toISOString();
	}

	/** Live parse of the title being typed, so chips preview what gets captured. */
	$: quick = newTitle.trim() ? parseTaskQuickAdd(newTitle, { members }) : null;

	function isOverdue(task: TaskItem): boolean {
		if (!task.dueDate || task.completedAt) return false;
		return new Date(task.dueDate).getTime() < Date.now();
	}

	function canComplete(task: TaskItem): boolean {
		return task.userId === currentUserId || task.assignedTo === currentUserId;
	}

	/** True when the task has a tag whose name starts with the active filter (case-insensitive). */
	function matchesTagFilter(task: TaskItem): boolean {
		const q = tagFilter.trim().toLowerCase();
		if (!q) return true;
		return (task.tags ?? []).some((tag) => tag.toLowerCase().startsWith(q));
	}

	async function addTask() {
		if (!newTitle.trim() || adding) return;
		adding = true;
		try {
			// Quick-add: typed dates/priorities/assignees ("saturday",
			// "high priority", "for Dad") win over the explicit pickers;
			// a bare title keeps whatever the pickers say.
			const parsed = parseTaskQuickAdd(newTitle, { members });
			// A cadence ("every 2 weeks") with no picked date still needs a cursor.
			const due =
				parsed.dueDate ??
				inputToIso(newDueDate) ??
				(parsed.recurrenceFrequency ? endOfDayIso() : null);
			const res = await fetch('/api/tasks', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: parsed.title,
					dueDate: due,
					familyId: data.family.id,
					assignedTo: parsed.assignedTo ?? (newAssignedTo || currentUserId),
					priority: TASK_QUICK_ADD_PRIORITY_RE.test(newTitle) ? parsed.priority : newPriority,
					tags: parsed.tags,
					recurrenceFrequency: parsed.recurrenceFrequency,
					recurrenceInterval: parsed.recurrenceInterval
				})
			});
			if (res.ok) {
				newTitle = '';
				newDueDate = '';
				newAssignedTo = '';
				newPriority = 'normal';
				await invalidateAll();
			}
		} finally {
			adding = false;
		}
	}

	function inputToIso(value: string): string | null {
		if (!value) return null;
		const [y, m, d] = value.split('-').map(Number);
		return new Date(y, m - 1, d, 23, 59, 0, 0).toISOString();
	}

	async function toggleTask(task: TaskItem) {
		busyId = task.id;
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
			busyId = null;
		}
	}

	async function advanceTask(id: string) {
		if (busyId) return;
		busyId = id;
		try {
			const res = await fetch(`/api/tasks/${id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ advanceToNext: true })
			});
			if (res.ok) {
				const j = await res.json().catch(() => ({}));
				await invalidateAll();
				showRecurringSkipFeedback(j.task);
			}
		} finally {
			busyId = null;
		}
	}

	async function respondAssignment(task: TaskItem, accept: boolean) {
		if (busyId) return;
		busyId = task.id;
		try {
			const res = await fetch(`/api/tasks/${task.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ assignmentStatus: accept ? 'accepted' : 'declined' })
			});
			if (res.ok) await invalidateAll();
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

	function matchesSearch(t: TaskItem): boolean {
		const q = searchQuery.trim().toLowerCase();
		if (!q) return true;
		if (t.title.toLowerCase().includes(q)) return true;
		if ((t.notes ?? '').toLowerCase().includes(q)) return true;
		if ((t.tags ?? []).some((g) => g.toLowerCase().includes(q))) return true;
		if (t.assigneeFirstName || t.assigneeLastName) {
			if (`${t.assigneeFirstName} ${t.assigneeLastName}`.toLowerCase().includes(q)) return true;
		}
		if (t.assignedTo && memberName(t.assignedTo).toLowerCase().includes(q)) return true;
		return false;
	}

	$: openTasks = data.tasks.filter(
		(t) => !t.completedAt && matchesTagFilter(t) && matchesSearch(t)
	);
	$: completedTasks = data.tasks.filter(
		(t) => t.completedAt && matchesTagFilter(t) && matchesSearch(t)
	);
	$: sortedOpenTasks = [...openTasks].sort((a, b) => sortTasks(a, b, sortBy));
	$: sortedCompletedTasks = [...completedTasks].sort(sortByCompletedDesc);
	$: queryActive = searchQuery.trim().length > 0;
	$: filterActive = tagFilter.trim().length > 0 || queryActive;

	// Group sorted open tasks by assignee so everyone sees who's on the hook.
	// Legacy unassigned rows fall into their own bucket.
	$: groupedIds = new Set(byAssignee.flatMap((g) => g.tasks.map((t) => t.id)));
	$: unassignedTasks = sortedOpenTasks.filter((t) => !groupedIds.has(t.id));

	$: byAssignee = members
		.map((m) => ({
			member: m,
			tasks: sortedOpenTasks.filter(
				(t) => t.assignedTo === m.userId && t.assignmentStatus !== 'declined'
			)
		}))
		.filter((g) => g.tasks.length > 0)
		.sort((a, b) =>
			a.member.userId === currentUserId ? -1 : b.member.userId === currentUserId ? 1 : 0
		);
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
		<!-- Add family task -->
		<form
			onsubmit={(e) => {
				e.preventDefault();
				addTask();
			}}
			class="mb-8 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
		>
			<div class="flex flex-col gap-2 sm:flex-row">
				<div class="flex-1">
					<MentionInput bind:value={newTitle} {members} placeholder="Add a family task..." />
					<TaskQuickAddPreview parsed={quick} {memberName} {formatDue} />
				</div>
				<input
					type="date"
					bind:value={newDueDate}
					aria-label="Due date"
					class="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-600 sm:w-[10.5rem]"
				/>
				<select
					bind:value={newAssignedTo}
					aria-label="Assign to"
					class="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700"
				>
					<option value="">Me</option>
					{#each members.filter((m) => m.userId !== currentUserId) as m (m.userId)}
						<option value={m.userId}>{m.firstName} {m.lastName}</option>
					{/each}
				</select>
				<select
					bind:value={newPriority}
					aria-label="Priority"
					class="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700"
				>
					<option value="low">Low</option>
					<option value="normal">Normal</option>
					<option value="high">High</option>
				</select>
				<button
					type="submit"
					disabled={adding || !newTitle.trim()}
					class="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
				>
					Add
				</button>
			</div>
			<p class="mt-2 text-xs text-slate-400">
				Try "clean gutters saturday", "high priority pay rent for Dad", "every 2 weeks" — dates,
				priority, repeats and assignees can be typed right in the title. Otherwise tasks go to you
				(or whoever you pick) and wait for their confirmation.
			</p>
		</form>

		<!-- Search + sort + tag filter -->
		<div class="mb-4 space-y-2">
			<div class="flex flex-col gap-2 sm:flex-row">
				<div class="relative flex-1">
					<input
						type="text"
						bind:value={searchQuery}
						placeholder="Search tasks…"
						aria-label="Search tasks"
						class="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-9 text-sm text-slate-700 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none"
					/>
					<svg
						class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z"
						/>
					</svg>
					{#if searchQuery.trim()}
						<button
							type="button"
							onclick={() => (searchQuery = '')}
							aria-label="Clear search"
							class="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
						>
							<svg
								class="h-3.5 w-3.5"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="2"
							>
								<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					{/if}
				</div>
				<label class="flex items-center gap-2 text-sm text-slate-500">
					<span class="shrink-0">Sort</span>
					<select
						bind:value={sortBy}
						aria-label="Sort tasks"
						class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
					>
						<option value="due">Due date</option>
						<option value="priority">Priority</option>
						<option value="created">Created</option>
						<option value="title">Title A–Z</option>
					</select>
				</label>
			</div>
			<div class="relative">
				<svg
					class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z"
					/>
				</svg>
				<input
					type="text"
					bind:value={tagFilter}
					placeholder="Filter by #tag..."
					aria-label="Filter tasks by tag"
					class="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-9 text-sm text-slate-700 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none"
				/>
				{#if tagFilter.trim()}
					<button
						type="button"
						onclick={() => (tagFilter = '')}
						aria-label="Clear tag filter"
						class="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
					>
						<svg
							class="h-3.5 w-3.5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				{/if}
			</div>
			{#if filterActive}
				<p class="text-xs text-sky-600">
					{#if tagFilter.trim()}
						Filtering by <span class="font-medium">#{tagFilter.trim().toLowerCase()}</span>
						{#if queryActive}·{/if}
					{/if}
					{#if queryActive}Searching “{searchQuery.trim()}”{/if}
				</p>
			{/if}
		</div>

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

		<!-- Open tasks grouped by assignee -->
		{#each byAssignee as group (group.member.userId)}
			<section class="mb-6">
				<h2
					class="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400"
				>
					<span
						class="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold {avatarColor(
							group.member.userId
						)}"
					>
						{group.member.firstName?.[0]?.toUpperCase() ?? '?'}
					</span>
					{memberName(group.member.userId)}
					<span class="font-normal normal-case text-slate-300">· {group.tasks.length}</span>
				</h2>
				<div class="space-y-1.5">
					{#each group.tasks as task (task.id)}
						<FamilyTaskRow
							task={task}
							variant="open"
							currentUserId={currentUserId}
							canComplete={canComplete(task)}
							completeTitle={canComplete(task)
								? 'Complete task'
								: `Only ${firstName(task.assignedTo)} or the creator can complete this`}
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
			</section>
		{/each}

		{#if unassignedTasks.length > 0}
			<section class="mb-6">
				<h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
					Unassigned
					<span class="font-normal normal-case text-slate-300">· {unassignedTasks.length}</span>
				</h2>
				<div class="space-y-1.5">
					{#each unassignedTasks as task (task.id)}
						<FamilyTaskRow
							task={task}
							variant="open"
							currentUserId={currentUserId}
							canComplete={canComplete(task)}
							completeTitle={canComplete(task)
								? 'Complete task'
								: `Only ${firstName(task.assignedTo)} or the creator can complete this`}
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
			</section>
		{/if}

		<!-- Completed -->
		{#if completedTasks.length > 0}
			<h2 class="mb-2 mt-8 text-xs font-semibold uppercase tracking-wide text-slate-400">
				Completed ({completedTasks.length})
			</h2>
			<div class="space-y-1.5">
				{#each sortedCompletedTasks as task (task.id)}
					<FamilyTaskRow
						task={task}
						variant="completed"
						currentUserId={currentUserId}
						canComplete={canComplete(task)}
						completeTitle="Mark incomplete"
						assigneeName={firstName(task.assignedTo)}
						overdue={false}
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
						task={task}
						variant="public"
						currentUserId={currentUserId}
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
