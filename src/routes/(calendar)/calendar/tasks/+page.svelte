<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import TaskRow from '$lib/components/tasks/TaskRow.svelte';
	import TaskCompletedRow from '$lib/components/tasks/TaskCompletedRow.svelte';
	import AssignmentsCard from '$lib/components/tasks/AssignmentsCard.svelte';
	import TaskToolbar, { type TaskChip } from '$lib/components/tasks/TaskToolbar.svelte';
	import AddTaskCard from '$lib/components/tasks/AddTaskCard.svelte';
	import EditTaskDialog, { type EditDraft } from '$lib/components/tasks/EditTaskDialog.svelte';
	import { avatarColor } from '$lib/utils/avatarColor';
	import { formatDue } from '$lib/utils/taskDisplay';
	import { trapFocusAction } from '$lib/utils/focusTrap';
	import { queueMutation } from '$lib/utils/offline';
	import { dueTone, priorityDot, priorityLabel } from '$lib/utils/priorityTone';
	import { sortByCompletedDesc, sortTasks, type TaskSortKey } from '$lib/utils/taskSort';
	import {
		showRecurringCompleteFeedback,
		showRecurringSkipFeedback
	} from '$lib/client/taskFeedback';
	import { pushToast } from '$lib/client/toasts';

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
		/** Task scoping (issue 019): family tasks carry their family's id. */
		familyId?: string | null;
		/** 'public' | 'private' — who can see the task. */
		visibility?: string | null;
		assigneeFirstName?: string | null;
		assigneeLastName?: string | null;
		creatorFirstName?: string | null;
		userId: string;
		eventId: string | null;
		eventTitle?: string | null;
		eventStart?: string | Date | null;
		createdAt?: string | Date | number | null;
		tags?: string[];
	};

	/** Per-chip helper copy for the empty state. */
	const CHIP_EMPTY: Record<TaskChip, { title: string; hint: string }> = {
		all: { title: 'No tasks yet', hint: 'Add your first task above' },
		public: {
			title: 'No public tasks',
			hint: 'Public tasks also show on your family’s Public tasks tab'
		},
		private: {
			title: 'No private tasks',
			hint: 'Only you (and anyone you assign) can see private tasks'
		},
		family: {
			title: 'No family tasks assigned to you',
			hint: 'New assignments appear in “To accept” below'
		}
	};

	/** TaskId -> optimistic completion state while a toggle is in flight. */
	interface CompletedOverrides {
		[taskId: string]: boolean;
	}

	let busyId: string | null = null;
	let actionError = '';
	/** Inline delete confirmation — matches the family-member remove pattern. */
	let confirmDeleteId: string | null = null;
	let confirmClear = false;
	let clearBusy = false;
	let tagFilter = '';
	let searchQuery = '';
	let sortBy: TaskSortKey = 'due';
	/** Active main-list chip (issue 019). */
	let chip: TaskChip = 'all';

	// Edit dialog state lives in EditTaskDialog; the page keeps the target + save.
	let editing: TaskItem | null = null;
	let editSaving = false;

	$: data.familyMembers = data.familyMembers ?? [];
	$: familyRoster = data.familyMembers ?? [];

	function memberName(userId: string): string {
		const m = familyRoster.find((f) => f.userId === userId);
		if (m) return `${m.firstName} ${m.lastName}`.trim();
		if (userId === data.user?.id) return 'You';
		return userId.slice(0, 8);
	}

	// Remember sort + tag-filter choices across visits (client-only).
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

	function openEdit(task: TaskItem) {
		if (busyId) return;
		editing = task;
	}

	async function respondAssignment(task: TaskItem, accept: boolean) {
		if (busyId) return;
		busyId = task.id;
		actionError = '';
		try {
			const res = await fetch(`/api/tasks/${task.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ assignmentStatus: accept ? 'accepted' : 'declined' })
			});
			if (!res.ok) {
				const j = await res.json().catch(() => ({}));
				actionError = j.error || "That didn't work. Try again.";
			} else {
				pushToast({
					message: accept
						? `Accepted "${task.title}" — it's on your list.`
						: `Declined "${task.title}" — sent back to the requester.`
				});
				await invalidateAll();
			}
		} catch {
			actionError = 'Network problem. Try again.';
		} finally {
			busyId = null;
		}
	}

	function closeEdit() {
		editing = null;
	}

	function inputToIso(value: string): string | null {
		if (!value) return null;
		const [y, m, d] = value.split('-').map(Number);
		return new Date(y, m - 1, d, 23, 59, 0, 0).toISOString();
	}

	async function saveEdit(draft: EditDraft) {
		if (!editing || !draft.title.trim() || editSaving) return;
		editSaving = true;
		actionError = '';
		try {
			const prevAssignee = editing.assignedTo ?? '';
			let assignedTo: string | null = draft.assignedTo || null;
			let assignmentStatus: string | null = null;
			if (assignedTo !== prevAssignee) {
				assignmentStatus = assignedTo
					? assignedTo === data.user?.id
						? 'accepted'
						: 'pending'
					: null;
			}
			const editPayload = {
				title: draft.title.trim(),
				notes: draft.notes.trim() || null,
				dueDate: inputToIso(draft.due),
				recurrenceFrequency: draft.freq || null,
				recurrenceInterval: draft.freq ? Math.max(1, Math.floor(draft.interval)) : null,
				assignedTo,
				priority: draft.priority,
				tags: parseEditTags(draft.tags),
				// Visibility is owner-only (issue 019): the server 403s anyone
				// else, so a non-owner assignee never sends the field (undefined
				// keys are dropped by JSON.stringify).
				visibility: editing.userId === data.user?.id ? draft.visibility : undefined
			};
			const res = await fetch(`/api/tasks/${editing.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(
					assignmentStatus === null ? editPayload : { ...editPayload, assignmentStatus }
				)
			});
			if (res.ok) {
				closeEdit();
				await invalidateAll();
			} else {
				const j = await res.json().catch(() => ({}));
				actionError = j.error || "That didn't work. Try again.";
			}
		} catch {
			actionError = 'Network problem. Try again.';
		} finally {
			editSaving = false;
		}
	}

	// Optimistic toggle overrides applied on top of server data until the
	// request resolves; referenced inline so $: picks up reassignment.
	let completedOverride: CompletedOverrides = {};

	// Parse the comma-separated tags input from the edit dialog into a
	// normalized list: trimmed, lowercased, deduped, empties dropped.
	function parseEditTags(raw: string): string[] {
		const seen = new Set<string>();
		const out: string[] = [];
		for (const part of raw.split(',')) {
			const tag = part.trim().toLowerCase().replace(/^#/, '');
			if (tag && !seen.has(tag)) {
				seen.add(tag);
				out.push(tag);
			}
		}
		return out;
	}

	// Main list source (issue 019): MY tasks — personal rows plus accepted
	// assignments, wherever they live. Pending assignments surface in the
	// "To accept" tab instead.
	// Streamed lists cache (#044): set once when taskLists resolves; the
	// derived chains (open/completed/filtered) run off the cache.
	let streamedLists: Awaited<PageData['taskLists']> | null = null;
	// Runs only when the taskLists promise identity changes (navigation /
	// invalidation), so unconditional assignment terminates.
	function stashTaskLists(tl: NonNullable<typeof streamedLists>): string {
		streamedLists = tl;
		return '';
	}
	$: allTasks = streamedLists?.myTasks ?? streamedLists?.tasks ?? [];
	$: openTasks = allTasks.filter(
		(t) => (t.id in completedOverride ? completedOverride[t.id] : !!t.completedAt) === false
	);
	$: completedTasks = allTasks.filter(
		(t) => (t.id in completedOverride ? completedOverride[t.id] : !!t.completedAt) === true
	);

	$: sortedOpenTasks = [...openTasks].sort((a, b) => sortTasks(a, b, sortBy));
	$: sortedCompletedTasks = [...completedTasks].sort(sortByCompletedDesc);
	$: queryActive = searchQuery.trim().length > 0;

	/** Chip predicate: family tasks partition off first, then visibility. */
	function matchesChip(t: TaskItem): boolean {
		if (chip === 'all') return true;
		if (chip === 'family') return !!t.familyId;
		return !t.familyId && (t.visibility ?? 'public') === chip;
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

	function matchesTagFilter(tags: string[] | undefined): boolean {
		const q = tagFilter.trim().toLowerCase();
		if (!q) return true;
		return (tags ?? []).some((t) => t.toLowerCase().startsWith(q));
	}
	$: chipFilteredOpenTasks = sortedOpenTasks.filter(matchesChip);
	$: chipFilteredCompletedTasks = sortedCompletedTasks.filter(matchesChip);
	$: filteredOpenTasks = chipFilteredOpenTasks.filter(
		(t) => matchesTagFilter(t.tags) && matchesSearch(t)
	);
	$: filteredCompletedTasks = chipFilteredCompletedTasks.filter(
		(t) => matchesTagFilter(t.tags) && matchesSearch(t)
	);
	$: tagFilterActive = tagFilter.trim().length > 0;
	$: filterActive = tagFilterActive || queryActive;
	$: chipActive = chip !== 'all';
	/** Priority dot/label classes live in the shared priorityTone module. */

	// Baseline framing (time-tracker research): show completions vs recent
	// activity, not streaks or leaderboards.
	$: completedThisWeek = completedTasks.filter(
		(t) => t.completedAt && Date.now() - new Date(t.completedAt).getTime() < 7 * 24 * 60 * 60 * 1000
	).length;

	async function toggleTask(id: string) {
		const task = allTasks.find((t) => t.id === id);
		if (!task || busyId) return;
		const completing = !(task.id in completedOverride
			? completedOverride[task.id]
			: !!task.completedAt);
		const previousDueDate = task.dueDate;
		busyId = id;
		actionError = '';
		completedOverride = { ...completedOverride, [id]: completing };
		try {
			const res = await fetch(`/api/tasks/${id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ toggleComplete: true })
			});
			if (!res.ok) {
				const j = await res.json().catch(() => ({}));
				actionError = j.error || "That didn't work. Try again.";
				clearOverride(id);
			} else {
				const j = await res.json().catch(() => ({}));
				await invalidateAll();
				clearOverride(id);
				if (completing && task.recurrenceFrequency) {
					celebrate(id);
					showRecurringCompleteFeedback(j.task, previousDueDate);
				} else if (completing) {
					celebrate(id);
					pushToast({ message: `"${task.title}" marked done.` });
				}
			}
		} catch {
			// Network error — queue for retry when back online.
			// Optimistic UI stays; replayPending() will re-send.
			await queueMutation(`/api/tasks/${id}`, 'PUT', { toggleComplete: true });
			actionError = '';
		} finally {
			busyId = null;
		}
	}

	async function advanceTask(id: string) {
		if (busyId) return;
		busyId = id;
		actionError = '';
		try {
			const res = await fetch(`/api/tasks/${id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ advanceToNext: true })
			});
			if (!res.ok) {
				const j = await res.json().catch(() => ({}));
				actionError = j.error || "That didn't work. Try again.";
			} else {
				const j = await res.json().catch(() => ({}));
				await invalidateAll();
				showRecurringSkipFeedback(j.task);
			}
		} catch {
			actionError = 'Network problem. Try again.';
		} finally {
			busyId = null;
		}
	}

	let celebratingId: string | null = null;
	let celebrateTimer: ReturnType<typeof setTimeout> | undefined;

	function clearOverride(id: string) {
		const rest = { ...completedOverride };
		delete rest[id];
		completedOverride = rest;
	}

	function celebrate(id: string) {
		clearTimeout(celebrateTimer);
		celebratingId = id;
		if ('vibrate' in navigator) navigator.vibrate?.(15);
		celebrateTimer = setTimeout(() => (celebratingId = null), 900);
	}

	async function deleteTask(id: string) {
		if (busyId) return;
		busyId = id;
		actionError = '';
		try {
			const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
			if (!res.ok) {
				const j = await res.json().catch(() => ({}));
				actionError = j.error || "That didn't work. Try again.";
			} else {
				const gone = allTasks.find((t) => t.id === id);
				pushToast({ message: `Deleted "${gone?.title ?? 'Task'}".` });
				await invalidateAll();
			}
		} catch {
			actionError = 'Network problem. Try again.';
		} finally {
			busyId = null;
			confirmDeleteId = null;
		}
	}

	async function clearCompleted() {
		if (clearBusy) return;
		clearBusy = true;
		actionError = '';
		try {
			const res = await fetch('/api/tasks/completed', { method: 'DELETE' });
			if (!res.ok) {
				const j = await res.json().catch(() => ({}));
				actionError = j.error || "That didn't work. Try again.";
				return;
			}
			pushToast({ message: 'Completed tasks cleared — fresh start.' });
			confirmClear = false;
			await invalidateAll();
		} catch {
			// Network error — queue for retry when back online
			await queueMutation('/api/tasks/completed', 'DELETE', null);
			actionError = '';
			confirmClear = false;
		} finally {
			clearBusy = false;
		}
	}
</script>

<div class="min-h-screen bg-slate-50">
	<div class="mx-auto max-w-4xl px-3 py-4 pb-20 sm:px-4">
		{#await data.taskLists}
			<section
				class="animate-pulse rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
				aria-hidden="true"
			>
				<div class="h-6 w-32 rounded bg-slate-100"></div>
				<div class="mt-2 h-4 w-48 rounded bg-slate-100"></div>
			</section>
		{:then tl}
			{@const _stash = stashTaskLists(tl)}
			{@const taskWarnings = [...(data.loadWarnings ?? []), ...tl.warnings]}
			<!-- Header card (family-hub hero pattern) -->
			<section
				class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
				aria-labelledby="tasks-heading"
			>
				<div class="min-w-0">
					<h1 id="tasks-heading" class="text-xl font-bold text-slate-900">Tasks</h1>
					<p class="mt-0.5 text-xs text-slate-400">
						{openTasks.length}
						{openTasks.length === 1 ? 'task' : 'tasks'} open · {completedTasks.length} completed
					</p>
				</div>
			</section>

			{#if taskWarnings.length > 0}
				<div
					class="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
					role="alert"
				>
					Couldn't load {taskWarnings.join(', ')} just now — everything else is up to date.
				</div>
			{/if}
		{:catch}
			<div
				class="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
				role="alert"
			>
				Couldn't load your tasks.
				<button type="button" onclick={() => invalidateAll()} class="font-semibold underline">
					Retry
				</button>
			</div>
		{/await}

		<AddTaskCard
			{familyRoster}
			familyId={data.familyId ?? null}
			{memberName}
			{formatDue}
			onError={(message) => (actionError = message)}
		/>

		{#if actionError}
			<div
				role="alert"
				class="mb-4 mt-4 flex items-center justify-between gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600"
			>
				<span>{actionError}</span>
				<button
					type="button"
					onclick={() => (actionError = '')}
					class="shrink-0 rounded-full p-0.5 text-red-400 transition-colors hover:bg-red-100 hover:text-red-600"
					aria-label="Dismiss error"
				>
					✕
				</button>
			</div>
		{/if}
		<!-- Main list card: toolbar (chips + search) + rows -->
		<section
			class="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
			aria-labelledby="tasks-list-heading"
		>
			<h2 id="tasks-list-heading" class="text-sm font-semibold text-slate-900">Your tasks</h2>
			<p class="mt-0.5 text-xs text-slate-400">Filter, search, and sort your list</p>

			<TaskToolbar bind:chip bind:searchQuery bind:sortBy bind:tagFilter />

			{#if filterActive || chipActive}
				<p class="mb-3 text-xs font-medium text-sky-600">
					{#if chipActive}
						Showing
						<span
							class="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700"
						>
							{chip === 'family' ? 'family tasks assigned to you' : `${chip} tasks`}
						</span>
						{#if tagFilterActive || queryActive}·{/if}
					{/if}
					{#if tagFilterActive}
						Filtering by <span
							class="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700"
							>#{tagFilter.trim().toLowerCase()}</span
						>
						{#if queryActive}·
						{/if}
					{/if}
					{#if queryActive}
						Searching “{searchQuery.trim()}”
					{/if}
				</p>
			{/if}

			{#if !streamedLists}
				<div class="space-y-1.5" aria-hidden="true">
					{#each Array(5) as _, i (i)}
						<div class="h-14 animate-pulse rounded-lg bg-slate-100"></div>
					{/each}
				</div>
			{:else if filteredOpenTasks.length === 0 && filteredCompletedTasks.length === 0}
				<div class="flex flex-col items-center justify-center py-16 text-center">
					<svg
						class="mb-4 h-14 w-14 text-slate-300"
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
					<p class="text-lg font-medium text-slate-700">
						{filterActive || chipActive ? 'No matching tasks' : CHIP_EMPTY[chip].title}
					</p>
					<p class="text-sm text-slate-500">
						{filterActive || chipActive
							? 'Try another chip, or clear the search and filters'
							: CHIP_EMPTY[chip].hint}
					</p>
				</div>
			{/if}

			<!-- Open tasks -->
			{#if filteredOpenTasks.length > 0}
				<h2
					class="mb-2 flex items-baseline gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400"
				>
					<span>Open ({filteredOpenTasks.length})</span>
				</h2>
			{/if}
			<div class="space-y-1.5">
				{#each filteredOpenTasks as task (task.id)}
					<TaskRow
						{task}
						currentUserId={data.user?.id}
						assigneeName={task.assignedTo ? memberName(task.assignedTo) : ''}
						busy={busyId === task.id}
						celebrating={celebratingId === task.id}
						confirmDelete={confirmDeleteId === task.id}
						onToggle={() => toggleTask(task.id)}
						onEdit={() => openEdit(task)}
						onAccept={() => respondAssignment(task, true)}
						onDecline={() => respondAssignment(task, false)}
						onAdvance={() => advanceTask(task.id)}
						onDelete={() => deleteTask(task.id)}
						onAskDelete={() => (confirmDeleteId = task.id)}
						onCancelDelete={() => (confirmDeleteId = null)}
					/>
				{/each}
			</div>

			{#if openTasks.length === 0 && completedTasks.length > 0 && !filterActive && !chipActive}
				<div class="rounded-xl border border-dashed border-slate-200 py-10 text-center">
					<p class="text-sm font-medium text-emerald-600">All caught up 🎉</p>
					<p class="text-sm text-slate-500">Nothing open right now</p>
				</div>
			{/if}

			<!-- Completed -->
			{#if filteredCompletedTasks.length > 0}
				<h2
					class="mb-2 mt-8 flex items-baseline gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400"
				>
					<span>Completed ({filteredCompletedTasks.length})</span>
					{#if completedThisWeek > 0}
						<span class="ml-1 font-normal normal-case text-emerald-600"
							>· {completedThisWeek} this week</span
						>
					{/if}
					{#if confirmClear}
						<span class="ml-auto flex items-center gap-1.5 font-normal normal-case">
							<span class="text-xs font-medium text-red-600">Delete all completed?</span>
							<button
								type="button"
								onclick={clearCompleted}
								disabled={clearBusy}
								class="rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
							>
								{clearBusy ? 'Deleting…' : 'Yes, delete'}
							</button>
							<button
								type="button"
								onclick={() => (confirmClear = false)}
								disabled={clearBusy}
								class="rounded-full bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-300"
							>
								No
							</button>
						</span>
					{:else}
						<button
							type="button"
							class="ml-auto font-medium normal-case text-slate-400 transition-colors hover:text-red-500"
							onclick={() => (confirmClear = true)}
						>
							Clear completed
						</button>
					{/if}
				</h2>
				<div class="space-y-1.5">
					{#each filteredCompletedTasks as task (task.id)}
						<TaskCompletedRow
							{task}
							busy={busyId === task.id}
							confirmDelete={confirmDeleteId === task.id}
							onToggle={() => toggleTask(task.id)}
							onDelete={() => deleteTask(task.id)}
							onAskDelete={() => (confirmDeleteId = task.id)}
							onCancelDelete={() => (confirmDeleteId = null)}
						/>
					{/each}
				</div>
			{/if}
		</section>

		<!-- Assignments (issue 019): To accept / Requested, separate card -->
		{#if streamedLists && ((streamedLists.pendingAssignments ?? []).length > 0 || (streamedLists.requestedByMe ?? []).length > 0)}
			<AssignmentsCard
				pending={streamedLists.pendingAssignments}
				requested={streamedLists.requestedByMe}
				{busyId}
				{formatDue}
				{memberName}
				onRespond={(task, accept) => respondAssignment(task, accept)}
			/>
		{/if}
	</div>
</div>

<!-- Edit task dialog -->
{#if editing}
	{#key editing.id}
		<EditTaskDialog
			task={editing}
			currentUserId={data.user?.id}
			{familyRoster}
			saving={editSaving}
			onSave={(draft) => saveEdit(draft)}
			onClose={closeEdit}
		/>
	{/key}
{/if}

<style>
	@media (prefers-reduced-motion: no-preference) {
		@keyframes pop {
			0% {
				transform: scale(1);
			}
			50% {
				transform: scale(1.02);
			}
			100% {
				transform: scale(1);
			}
		}
		.celebrate {
			animation: pop 0.45s ease;
		}
	}
</style>
