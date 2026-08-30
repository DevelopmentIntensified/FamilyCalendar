<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import { avatarColor } from '$lib/utils/avatarColor';
	import { parseTaskQuickAdd, TASK_QUICK_ADD_PRIORITY_RE } from '$lib/utils/taskQuickAdd';

	export let data: PageData;

	type TaskItem = {
		id: string;
		title: string;
		notes: string | null;
		dueDate: string | null;
		completedAt: string | null;
		recurrenceFrequency?: string | null;
		recurrenceInterval?: number | null;
		assignedTo?: string | null;
		assignmentStatus?: string | null;
		priority?: string | null;
		assigneeFirstName?: string | null;
		assigneeLastName?: string | null;
		creatorFirstName?: string | null;
		userId: string;
		eventId: string | null;
		eventTitle?: string | null;
	};

	let newTitle = '';
	let newDueDate = '';
	let newAssignedTo = '';
	let newPriority = 'normal';
	let adding = false;
	let busyId: string | null = null;

	$: members = data.members ?? [];
	$: currentUserId = data.currentUserId;

	const FREQ_NOUN: Record<string, string> = {
		daily: 'day',
		weekly: 'week',
		monthly: 'month',
		yearly: 'year'
	};
	const PRIORITY_DOT: Record<string, string> = {
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

	function canComplete(task: TaskItem): boolean {
		return task.userId === currentUserId || task.assignedTo === currentUserId;
	}

	async function addTask() {
		if (!newTitle.trim() || adding) return;
		adding = true;
		try {
			// Quick-add: typed dates/priorities/assignees ("saturday",
			// "high priority", "for Dad") win over the explicit pickers;
			// a bare title keeps whatever the pickers say.
			const parsed = parseTaskQuickAdd(newTitle, { members });
			const res = await fetch('/api/tasks', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: parsed.title,
					dueDate: parsed.dueDate ?? inputToIso(newDueDate),
					familyId: data.family.id,
					assignedTo: parsed.assignedTo ?? (newAssignedTo || currentUserId),
					priority: TASK_QUICK_ADD_PRIORITY_RE.test(newTitle) ? parsed.priority : newPriority
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

	async function advanceTask(id: string) {
		if (busyId) return;
		busyId = id;
		try {
			const res = await fetch(`/api/tasks/${id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ advanceToNext: true })
			});
			if (res.ok) await invalidateAll();
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

	function recurrenceNote(task: TaskItem): string {
		if (!task.recurrenceFrequency) return '';
		const noun = FREQ_NOUN[task.recurrenceFrequency] ?? task.recurrenceFrequency;
		return task.recurrenceInterval && task.recurrenceInterval > 1
			? `every ${task.recurrenceInterval} ${noun}s`
			: `every ${noun}`;
	}

	$: openTasks = (data.tasks as TaskItem[]).filter((t) => !t.completedAt);
	$: completedTasks = (data.tasks as TaskItem[]).filter((t) => t.completedAt);

	// Group open tasks by assignee so everyone sees who's on the hook.
	// Legacy unassigned rows fall into their own bucket.
	$: groupedIds = new Set(byAssignee.flatMap((g) => g.tasks.map((t) => t.id)));
	$: unassignedTasks = openTasks.filter((t) => !groupedIds.has(t.id));

	$: byAssignee = members
		.map((m) => ({
			member: m,
			tasks: openTasks.filter((t) => t.assignedTo === m.userId && t.assignmentStatus !== 'declined')
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

	<!-- Add family task -->
	<form
		onsubmit={(e) => {
			e.preventDefault();
			addTask();
		}}
		class="mb-8 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
	>
		<div class="flex flex-col gap-2 sm:flex-row">
			<input
				type="text"
				bind:value={newTitle}
				placeholder="Add a family task..."
				class="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
			/>
			<input
				type="date"
				bind:value={newDueDate}
				aria-label="Due date"
				class="rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-600"
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
			Try "clean gutters saturday", "high priority pay rent for Dad" — dates, priority and
			assignees can be typed right in the title. Otherwise tasks go to you (or whoever you pick)
			and wait for their confirmation.
		</p>
	</form>

	{#if openTasks.length === 0 && completedTasks.length === 0}
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
					<div
						class="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 transition-all hover:border-slate-300"
					>
						<button
							type="button"
							onclick={() => canComplete(task) && toggleTask(task.id)}
							disabled={busyId === task.id || !canComplete(task)}
							title={canComplete(task)
								? 'Complete task'
								: `Only ${firstName(task.assignedTo)} or the creator can complete this`}
							class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-slate-300 transition-colors enabled:hover:border-primary-500 disabled:cursor-not-allowed disabled:opacity-40"
							aria-label="Complete task"
						></button>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium text-slate-900">{task.title}</p>
							{#if task.recurrenceFrequency}
								<p class="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-purple-500">
									<svg
										class="h-3 w-3 shrink-0"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										stroke-width="2"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											d="M4 4v5h5M20 20v-5h-5M4 9a8 8 0 0114-3m2 9a8 8 0 01-14 3"
										/>
									</svg>
									{recurrenceNote(task)}
								</p>
							{:else if task.eventTitle}
								<p class="truncate text-xs font-medium text-primary-500">{task.eventTitle}</p>
							{:else if task.notes}
								<p class="truncate text-xs text-slate-500">{task.notes}</p>
							{/if}
						</div>
						{#if task.assignedTo && task.assignmentStatus === 'pending' && task.assignedTo === currentUserId}
							<span class="flex shrink-0 items-center gap-1">
								<button
									type="button"
									onclick={() => respondAssignment(task, true)}
									disabled={busyId === task.id}
									class="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-200"
									title="Accept"
								>
									✓ Accept
								</button>
								<button
									type="button"
									onclick={() => respondAssignment(task, false)}
									disabled={busyId === task.id}
									class="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 hover:bg-red-200"
									title="Decline"
								>
									✕
								</button>
							</span>
						{:else if task.assignedTo && task.assignmentStatus === 'pending'}
							<span
								class="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700"
							>
								waiting for {firstName(task.assignedTo)}
							</span>
						{/if}
						{#if task.dueDate}
							<span
								class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium {isOverdue(task)
									? 'bg-red-100 text-red-700'
									: 'bg-slate-100 text-slate-600'}"
							>
								{formatDue(task.dueDate)}
							</span>
						{/if}
						{#if task.priority && task.priority !== 'normal'}
							<span class="h-2 w-2 shrink-0 rounded-full {PRIORITY_DOT[task.priority]}" title="Priority: {task.priority}"></span>
						{/if}
						{#if task.userId === currentUserId}
							{#if task.recurrenceFrequency && !task.completedAt}
								<button
									type="button"
									onclick={() => advanceTask(task.id)}
									disabled={busyId === task.id}
									class="shrink-0 rounded-full p-1.5 text-slate-300 opacity-0 transition-all hover:bg-purple-100 hover:text-purple-500 group-hover:opacity-100"
									title="Skip this occurrence (rolls to next)"
									aria-label="Skip to next occurrence"
								>
									<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
										<path stroke-linecap="round" stroke-linejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
									</svg>
								</button>
							{/if}
							<button
								type="button"
								onclick={() => deleteTask(task.id)}
								disabled={busyId === task.id}
								class="shrink-0 rounded-full p-1.5 text-slate-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
								aria-label="Delete task"
							>
								<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
									/>
								</svg>
							</button>
						{/if}
					</div>
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
					<div
						class="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 transition-all hover:border-slate-300"
					>
						<button
							type="button"
							onclick={() => canComplete(task) && toggleTask(task.id)}
							disabled={busyId === task.id || !canComplete(task)}
							class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-slate-300 transition-colors enabled:hover:border-primary-500 disabled:cursor-not-allowed disabled:opacity-40"
							aria-label="Complete task"
						></button>
						<p class="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">{task.title}</p>
						{#if task.dueDate}
							<span
								class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium {isOverdue(task)
									? 'bg-red-100 text-red-700'
									: 'bg-slate-100 text-slate-600'}"
							>
								{formatDue(task.dueDate)}
							</span>
						{/if}
						{#if task.priority && task.priority !== 'normal'}
							<span class="h-2 w-2 shrink-0 rounded-full {PRIORITY_DOT[task.priority]}" title="Priority: {task.priority}"></span>
						{/if}
						{#if task.userId === currentUserId}
							{#if task.recurrenceFrequency && !task.completedAt}
								<button
									type="button"
									onclick={() => advanceTask(task.id)}
									disabled={busyId === task.id}
									class="shrink-0 rounded-full p-1.5 text-slate-300 opacity-0 transition-all hover:bg-purple-100 hover:text-purple-500 group-hover:opacity-100"
									title="Skip this occurrence (rolls to next)"
									aria-label="Skip to next occurrence"
								>
									<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
										<path stroke-linecap="round" stroke-linejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
									</svg>
								</button>
							{/if}
							<button
								type="button"
								onclick={() => deleteTask(task.id)}
								disabled={busyId === task.id}
								class="shrink-0 rounded-full p-1.5 text-slate-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
								aria-label="Delete task"
							>
								<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
									/>
								</svg>
							</button>
						{/if}
					</div>
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
			{#each completedTasks as task (task.id)}
				<div class="group flex items-center gap-3 rounded-xl bg-slate-50 p-3">
					<button
						type="button"
						onclick={() => canComplete(task) && toggleTask(task.id)}
						disabled={busyId === task.id || !canComplete(task)}
						class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-500 text-white disabled:cursor-not-allowed disabled:opacity-40"
						aria-label="Mark incomplete"
					>
						<svg
							class="h-3 w-3"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="3"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
						</svg>
					</button>
					<p class="min-w-0 flex-1 truncate text-sm text-slate-400 line-through">
						{task.title}
					</p>
					<span class="shrink-0 text-xs text-slate-400">{firstName(task.assignedTo)}</span>
					{#if task.userId === currentUserId}
						<button
							type="button"
							onclick={() => deleteTask(task.id)}
							disabled={busyId === task.id}
							class="shrink-0 rounded-full p-1.5 text-slate-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
							aria-label="Delete task"
						>
							<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
								/>
							</svg>
						</button>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
