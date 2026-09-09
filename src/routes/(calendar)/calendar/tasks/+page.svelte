<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import AssignmentsCard from '$lib/components/tasks/AssignmentsCard.svelte';
	import TasksMainList from '$lib/components/tasks/TasksMainList.svelte';
	import TasksHeader from '$lib/components/tasks/TasksHeader.svelte';
	import type { TaskChip } from '$lib/components/tasks/TaskToolbar.svelte';
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
	import { buildEditPayload } from '$lib/utils/taskEditPayload';
	import { respondToTask as respondToTaskAction } from '$lib/utils/familyTaskActions';

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
		const out = await respondToTaskAction(task, accept);
		if (!out.ok) {
			actionError = out.error;
		} else {
			pushToast({
				message: accept
					? `Accepted "${task.title}" — it's on your list.`
					: `Declined "${task.title}" — sent back to the requester.`
			});
			await invalidateAll();
		}
		busyId = null;
	}

	function closeEdit() {
		editing = null;
	}

	async function saveEdit(draft: EditDraft) {
		if (!editing || !draft.title.trim() || editSaving) return;
		editSaving = true;
		actionError = '';
		try {
			const { payload } = buildEditPayload(editing, draft, data.user?.id);
			const res = await fetch(`/api/tasks/${editing.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
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
			<TasksHeader
				openCount={openTasks.length}
				completedCount={completedTasks.length}
				warnings={[...(data.loadWarnings ?? []), ...tl.warnings]}
			/>
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
		<TasksMainList
			bind:chip
			bind:searchQuery
			bind:sortBy
			bind:tagFilter
			bind:confirmClear
			loaded={!!streamedLists}
			openCount={openTasks.length}
			completedCount={completedTasks.length}
			{completedThisWeek}
			filteredOpen={filteredOpenTasks}
			filteredCompleted={filteredCompletedTasks}
			currentUserId={data.user?.id}
			{busyId}
			{celebratingId}
			{confirmDeleteId}
			{clearBusy}
			assigneeName={(task) => (task.assignedTo ? memberName(task.assignedTo) : '')}
			onToggle={(id) => toggleTask(id)}
			onEdit={(task) => openEdit(task)}
			onRespond={(task, accept) => respondAssignment(task, accept)}
			onAdvance={(id) => advanceTask(id)}
			onDelete={(id) => deleteTask(id)}
			onAskDelete={(id) => (confirmDeleteId = id)}
			onCancelDelete={() => (confirmDeleteId = null)}
			onBeginClear={() => (confirmClear = true)}
			onCancelClear={() => (confirmClear = false)}
			onClearCompleted={clearCompleted}
		/>

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
