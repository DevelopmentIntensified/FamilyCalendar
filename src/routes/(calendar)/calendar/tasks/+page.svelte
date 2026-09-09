<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import MentionInput from '$lib/components/MentionInput.svelte';
	import TaskQuickAddPreview from '$lib/components/TaskQuickAddPreview.svelte';
	import TaskQuickAddHelp from '$lib/components/TaskQuickAddHelp.svelte';
	import TaskRow from '$lib/components/tasks/TaskRow.svelte';
	import TaskCompletedRow from '$lib/components/tasks/TaskCompletedRow.svelte';
	import AssignmentsCard from '$lib/components/tasks/AssignmentsCard.svelte';
	import {
		CATEGORY_META,
		SMART_EVENT_TEMPLATES,
		type SmartEventCategory,
		type SmartEventTemplate
	} from '$lib/data/smartEventTemplates';
	import { avatarColor } from '$lib/utils/avatarColor';
	import { trapFocusAction } from '$lib/utils/focusTrap';
	import { queueMutation } from '$lib/utils/offline';
	import { parseTaskQuickAdd } from '$lib/utils/taskQuickAdd';
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

	/** Main-list filter chips (issue 019). 'family' = family tasks assigned to me. */
	type TaskChip = 'all' | 'public' | 'private' | 'family';
	const CHIPS: { value: TaskChip; label: string }[] = [
		{ value: 'all', label: 'All' },
		{ value: 'public', label: 'Public' },
		{ value: 'private', label: 'Private' },
		{ value: 'family', label: 'Family' }
	];
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

	let newTitle = '';
	let newDueDate = '';
	let adding = false;
	let busyId: string | null = null;
	let busyTemplateId: string | null = null;
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
	/** Visibility picker for the create form (a #public/#private tag in the title wins). */
	let newVisibility: 'public' | 'private' = 'public';

	// Edit dialog
	const FREQ_OPTIONS = [
		{ value: '', label: "Doesn't repeat" },
		{ value: 'daily', label: 'Daily' },
		{ value: 'weekly', label: 'Weekly' },
		{ value: 'monthly', label: 'Monthly' },
		{ value: 'yearly', label: 'Yearly' }
	];
	/** Recurrence frequency -> singular noun for "every N <noun>s". */
	interface FreqNouns {
		[key: string]: string;
	}
	const FREQ_NOUN: FreqNouns = {
		daily: 'day',
		weekly: 'week',
		monthly: 'month',
		yearly: 'year'
	};

	let editing: TaskItem | null = null;
	let editTitle = '';
	let editNotes = '';
	let editTags = '';
	let editDue = '';
	let editFreq = '';
	let editInterval = 1;
	let editAssignedTo = '';
	let editPriority = 'normal';
	/** Visibility editable in the dialog by the owner only (issue 019). */
	let editVisibility: 'public' | 'private' = 'public';
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
		if (busyId || busyTemplateId) return;
		editing = task;
		editTitle = task.title;
		editNotes = task.notes ?? '';
		editTags = (task.tags ?? []).join(', ');
		editDue = toInputDate(task.dueDate);
		editFreq = task.recurrenceFrequency ?? '';
		editInterval = task.recurrenceInterval ?? 1;
		editAssignedTo = task.assignedTo ?? '';
		editPriority = task.priority ?? 'normal';
		editVisibility = task.visibility === 'private' ? 'private' : 'public';
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

	function pad(n: number): string {
		return String(n).padStart(2, '0');
	}

	function toInputDate(iso: string | null): string {
		if (!iso) return '';
		const d = new Date(iso);
		return isNaN(d.getTime())
			? ''
			: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
	}

	function inputToIso(value: string): string | null {
		if (!value) return null;
		const [y, m, d] = value.split('-').map(Number);
		return new Date(y, m - 1, d, 23, 59, 0, 0).toISOString();
	}

	async function saveEdit() {
		if (!editing || !editTitle.trim() || editSaving) return;
		editSaving = true;
		actionError = '';
		try {
			const prevAssignee = editing.assignedTo ?? '';
			let assignedTo: string | null = editAssignedTo || null;
			let assignmentStatus: string | null = null;
			if (assignedTo !== prevAssignee) {
				assignmentStatus = assignedTo
					? assignedTo === data.user?.id
						? 'accepted'
						: 'pending'
					: null;
			}
			const editPayload = {
				title: editTitle.trim(),
				notes: editNotes.trim() || null,
				dueDate: inputToIso(editDue),
				recurrenceFrequency: editFreq || null,
				recurrenceInterval: editFreq ? Math.max(1, Math.floor(editInterval)) : null,
				assignedTo,
				priority: editPriority,
				tags: parseEditTags(editTags),
				// Visibility is owner-only (issue 019): the server 403s anyone
				// else, so a non-owner assignee never sends the field (undefined
				// keys are dropped by JSON.stringify).
				visibility: editing.userId === data.user?.id ? editVisibility : undefined
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
	function stashTaskLists(tl: NonNullable<typeof streamedLists>): string {
		if (!streamedLists) streamedLists = tl;
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

	function formatDue(due: string | null): string {
		if (!due) return '';
		const dt = new Date(due);
		if (isNaN(dt.getTime())) return '';
		// Long (multi-year) recurring tasks need the year; same-year dates stay short.
		const opts: Intl.DateTimeFormatOptions =
			dt.getFullYear() !== new Date().getFullYear()
				? { month: 'short', day: 'numeric', year: 'numeric' }
				: { month: 'short', day: 'numeric' };
		return dt.toLocaleDateString(undefined, opts);
	}

	/** End-of-today ISO slot — used when a recurrence is typed with no due date. */
	function endOfDayIso(): string {
		const d = new Date();
		d.setHours(23, 59, 0, 0);
		return d.toISOString();
	}

	/** Live parse of the title being typed, so chips preview what gets captured. */
	$: quick = newTitle.trim() ? parseTaskQuickAdd(newTitle, { members: familyRoster }) : null;

	/** Live parse of the title being typed, so chips preview what gets captured. */

	async function addTask() {
		if (!newTitle.trim()) return;
		adding = true;
		actionError = '';
		try {
			const parsed = parseTaskQuickAdd(newTitle, { members: familyRoster });
			// Unknown/ambiguous @member: never silently dropped — block the
			// create and keep the input so the user can fix the name.
			if (parsed.unknownMember) {
				actionError = `Unknown member ${parsed.unknownMember} — check the spelling or pick someone from your family.`;
				return;
			}
			if (parsed.familyTask && !data.familyId) {
				actionError = "@family needs a family — you're not in one yet.";
				return;
			}
			// A cadence ("every 2 weeks") with no picked date still needs a cursor.
			const due =
				parsed.dueDate ??
				(newDueDate || null) ??
				(parsed.recurrenceFrequency ? endOfDayIso() : null);
			const res = await fetch('/api/tasks', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: parsed.title,
					dueDate: due,
					priority: parsed.priority,
					assignedTo: parsed.assignedTo,
					// An explicit #public/#private tag in the title wins over the picker.
					visibility: parsed.visibilityExplicit ? parsed.visibility : newVisibility,
					// POST defaults an absent familyId to the user's family, so a
					// personal task must send null explicitly (issue 019).
					familyId: parsed.familyTask ? data.familyId : null,
					tags: parsed.tags,
					recurrenceFrequency: parsed.recurrenceFrequency,
					recurrenceInterval: parsed.recurrenceInterval
				})
			});
			if (res.ok) {
				pushToast({ message: `Added "${parsed.title}".` });
				newTitle = '';
				newDueDate = '';
				await invalidateAll();
			} else {
				const j = await res.json().catch(() => ({}));
				actionError = j.error || "That didn't work. Try again.";
			}
		} catch {
			actionError = 'Network problem. Try again.';
		} finally {
			adding = false;
		}
	}

	// Template descriptions explain the cadence; fall back to a
	// generated phrase for templates without one.
	function cadenceNote(t: SmartEventTemplate): string {
		if (t.description) return t.description;
		const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[
			t.recurrenceFrequency
		];
		const units = { daily: 'days', weekly: 'weeks', monthly: 'months', yearly: 'years' }[
			t.recurrenceFrequency
		];
		return t.recurrenceInterval > 1 ? `Every ${t.recurrenceInterval} ${units}` : `Every ${unit}`;
	}

	async function addSmartTask(t: SmartEventTemplate) {
		if (busyTemplateId) return;
		busyTemplateId = t.id;
		try {
			const res = await fetch('/api/tasks', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: t.name,
					// First occurrence lands today; cadence keeps it coming back.
					dueDate: new Date(new Date().setHours(23, 59, 0, 0)).toISOString(),
					recurrenceFrequency: t.recurrenceFrequency,
					recurrenceInterval: t.recurrenceInterval
				})
			});
			if (res.ok) {
				pushToast({
					message: `Added "${t.name}"${cadenceNote(t) ? ` — ${cadenceNote(t).toLowerCase()}` : ''}.`
				});
				await invalidateAll();
			} else {
				const j = await res.json().catch(() => ({}));
				pushToast({
					message: j.error || `Couldn't add "${t.name}" — try again.`
				});
			}
		} catch {
			pushToast({ message: `Couldn't add "${t.name}" — check your connection.` });
		} finally {
			busyTemplateId = null;
		}
	}

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

		<!-- Add task card -->
		<section
			class="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
			aria-labelledby="add-task-heading"
		>
			<h2 id="add-task-heading" class="text-sm font-semibold text-slate-900">Add a task</h2>
			<p class="mt-0.5 text-xs text-slate-400">
				Type naturally — dates, repeats, @assignee and #tags just work
			</p>
			<form
				onsubmit={(e) => {
					e.preventDefault();
					addTask();
				}}
				class="mt-3 flex flex-col gap-2 sm:flex-row"
			>
				<div class="min-w-0 flex-1">
					<div class="flex items-start gap-1">
						<div class="min-w-0 flex-1">
							<MentionInput
								bind:value={newTitle}
								members={familyRoster}
								placeholder="Add a task... e.g. Buy milk tomorrow @maya"
							/>
							<TaskQuickAddPreview parsed={quick} {memberName} {formatDue} />
						</div>
						<TaskQuickAddHelp />
					</div>
					{#if quick?.unknownMember}
						<p class="mt-1 text-xs font-medium text-red-600" role="alert">
							Unknown member {quick.unknownMember} — check the spelling or pick someone from your family.
						</p>
					{/if}
					<p class="mt-1 text-xs text-slate-400">
						Tip: type <span class="font-mono text-slate-500">"every 2 weeks"</span> for a repeat, or
						<span class="font-mono text-slate-500">#tag</span>
						to tag (e.g. <span class="font-mono text-slate-500">#groceries</span>).
					</p>
				</div>
				<div class="flex flex-col gap-2 sm:flex-row">
					<select
						bind:value={newVisibility}
						aria-label="Who can see this task"
						class="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-primary-500 focus:outline-none sm:w-auto"
					>
						<option value="public">🌐 Public</option>
						<option value="private">🔒 Private</option>
					</select>
					<input
						type="date"
						bind:value={newDueDate}
						aria-label="Due date"
						class="min-h-[44px] w-full min-w-0 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-600 sm:w-[10.5rem]"
					/>
					<button
						type="submit"
						disabled={adding || !newTitle.trim()}
						class="min-h-[44px] shrink-0 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
					>
						Add
					</button>
				</div>
			</form>

			<!-- Smart task templates -->
			<details class="group mt-3">
				<summary
					class="flex w-fit cursor-pointer select-none items-center gap-1 rounded-full px-2 py-0.5 text-xs text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
				>
					<span>✨ Smart tasks</span>
					<svg
						class="h-3 w-3 transition-transform group-open:rotate-180"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
					</svg>
				</summary>
				<div class="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
					{#each Object.keys(CATEGORY_META) as cat (cat)}
						{@const templates = SMART_EVENT_TEMPLATES.filter(
							(t) => t.category === (cat as SmartEventCategory)
						)}
						<details class="mb-1 last:mb-0" open={Object.keys(CATEGORY_META).indexOf(cat) === 0}>
							<summary
								class="cursor-pointer select-none rounded-lg px-2 py-1.5 text-sm font-medium text-slate-700 hover:bg-white"
							>
								{CATEGORY_META[cat as SmartEventCategory].icon}
								{CATEGORY_META[cat as SmartEventCategory].label}
								<span class="ml-1 text-xs font-normal text-slate-400">({templates.length})</span>
							</summary>
							<div class="mt-1 flex flex-wrap gap-1.5 pl-2">
								{#each templates as template (template.id)}
									<button
										type="button"
										onclick={() => addSmartTask(template)}
										disabled={busyTemplateId === template.id}
										title={cadenceNote(template)}
										class="rounded-full border px-2.5 py-1 text-xs font-medium transition-colors hover:opacity-80 disabled:opacity-50 {CATEGORY_META[
											template.category
										].color}"
									>
										{template.name}
									</button>
								{/each}
							</div>
						</details>
					{/each}
				</div>
			</details>
		</section>

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

			<!-- Filter chips (issue 019): single-select pills over the ONE main list -->
			<div class="mb-3 mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter tasks by scope">
				{#each CHIPS as c (c.value)}
					<button
						type="button"
						onclick={() => (chip = c.value)}
						aria-pressed={chip === c.value}
						class="min-h-[44px] rounded-full border px-3.5 text-sm font-medium transition-colors {chip ===
						c.value
							? 'border-slate-900 bg-slate-900 text-white'
							: 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'}"
					>
						{c.label}
					</button>
				{/each}
			</div>
			<!-- Search + sort + tag filter -->
			<div class="mb-4 space-y-2">
				<div class="flex flex-col gap-2 sm:flex-row">
					<div class="relative flex-1">
						<input
							type="text"
							bind:value={searchQuery}
							placeholder="Search tasks…"
							aria-label="Search tasks"
							class="w-full rounded-lg border border-slate-300 bg-white py-2 pl-8 pr-8 text-sm text-slate-700 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
						/>
						<svg
							class="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z"
							/>
						</svg>
						{#if searchQuery}
							<button
								type="button"
								onclick={() => (searchQuery = '')}
								class="absolute right-1 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
								aria-label="Clear search"
								title="Clear search"
							>
								<svg
									class="h-4 w-4"
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
					<label class="flex w-full items-center gap-2 text-sm text-slate-500 sm:w-auto">
						<span class="shrink-0">Sort</span>
						<select
							bind:value={sortBy}
							aria-label="Sort tasks"
							class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 sm:w-auto"
						>
							<option value="due">Due date</option>
							<option value="priority">Priority</option>
							<option value="created">Created</option>
							<option value="title">Title A–Z</option>
						</select>
					</label>
				</div>
				<div class="relative">
					<span
						class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400"
						aria-hidden="true">#</span
					>
					<input
						type="text"
						bind:value={tagFilter}
						placeholder="Filter by #tag…"
						aria-label="Filter tasks by tag"
						title="Prefix match: typing “gro” matches #groceries"
						class="w-full rounded-lg border border-slate-300 bg-white py-2 pl-8 pr-8 text-sm text-slate-700 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
					/>
					{#if tagFilter}
						<button
							type="button"
							onclick={() => (tagFilter = '')}
							class="absolute right-1 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
							aria-label="Clear tag filter"
							title="Clear filter"
						>
							<svg
								class="h-4 w-4"
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
			</div>
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
				busyId={busyId}
				{formatDue}
				{memberName}
				onRespond={(task, accept) => respondAssignment(task, accept)}
			/>
		{/if}
	</div>
</div>

<!-- Edit task dialog -->
{#if editing}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
		onclick={closeEdit}
		onkeydown={(e) => e.key === 'Escape' && closeEdit()}
		role="presentation"
	>
		<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
		<div
			class="w-full max-w-md rounded-xl bg-white shadow-2xl"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			aria-label="Edit task"
			use:trapFocusAction
		>
			<div class="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
				<h2 class="text-base font-semibold text-slate-900">Edit Task</h2>
				<button
					type="button"
					onclick={closeEdit}
					class="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
					aria-label="Close"
				>
					<svg
						class="h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<form
				class="space-y-3 p-5"
				onsubmit={(e) => {
					e.preventDefault();
					saveEdit();
				}}
			>
				<div>
					<label for="edit-title" class="mb-1 block text-sm font-medium text-slate-700"
						>Title *</label
					>
					<input
						id="edit-title"
						type="text"
						bind:value={editTitle}
						required
						class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
					/>
				</div>

				<div>
					<label for="edit-notes" class="mb-1 block text-sm font-medium text-slate-700">Notes</label
					>
					<textarea
						id="edit-notes"
						bind:value={editNotes}
						rows="2"
						class="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
					></textarea>
				</div>

				<div>
					<label for="edit-tags" class="mb-1 block text-sm font-medium text-slate-700">Tags</label>
					<input
						id="edit-tags"
						type="text"
						bind:value={editTags}
						placeholder="e.g. groceries, home (comma separated)"
						class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
					/>
					<p class="mt-1 text-xs text-slate-400">Separate tags with commas.</p>
				</div>

				<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
					<div>
						<label for="edit-due" class="mb-1 block text-sm font-medium text-slate-700"
							>Due date</label
						>
						<input
							id="edit-due"
							type="date"
							bind:value={editDue}
							class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
						/>
					</div>
					<div>
						<label for="edit-priority" class="mb-1 block text-sm font-medium text-slate-700"
							>Priority</label
						>
						<select
							id="edit-priority"
							bind:value={editPriority}
							class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
						>
							<option value="low">Low</option>
							<option value="normal">Normal</option>
							<option value="high">High</option>
						</select>
					</div>
					<div>
						<label for="edit-freq" class="mb-1 block text-sm font-medium text-slate-700"
							>Repeats</label
						>
						<select
							id="edit-freq"
							bind:value={editFreq}
							class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
						>
							{#each FREQ_OPTIONS as opt (opt.value)}
								<option value={opt.value}>{opt.label}</option>
							{/each}
						</select>
					</div>
				</div>

				{#if editFreq}
					<div class="flex items-center gap-2 rounded-lg bg-purple-50 px-3 py-2">
						<span class="text-sm text-purple-800">Every</span>
						<input
							type="number"
							min="1"
							max="365"
							bind:value={editInterval}
							aria-label="Repeat interval"
							class="w-16 rounded-lg border border-purple-200 px-2 py-1 text-sm focus:border-purple-400 focus:outline-none"
						/>
						<span class="text-sm text-purple-800"
							>{FREQ_NOUN[editFreq]}{editInterval > 1 ? 's' : ''}</span
						>
					</div>
				{/if}

				{#if editing.userId === data.user?.id}
					<div>
						<label for="edit-visibility" class="mb-1 block text-sm font-medium text-slate-700"
							>Who can see this</label
						>
						<select
							id="edit-visibility"
							bind:value={editVisibility}
							class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
						>
							<option value="public">🌐 Public — family can see it (read-only)</option>
							<option value="private">🔒 Private — only you and the assignee</option>
						</select>
					</div>
				{/if}

				{#if familyRoster.length > 0}
					<div>
						<label for="edit-assignee" class="mb-1 block text-sm font-medium text-slate-700"
							>Assign to</label
						>
						<select
							id="edit-assignee"
							bind:value={editAssignedTo}
							class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
						>
							<option value="">Unassigned</option>
							<option value={data.user?.id}>Me</option>
							{#each familyRoster.filter((m) => m.userId !== data.user?.id) as m (m.userId)}
								<option value={m.userId}>{m.firstName} {m.lastName}</option>
							{/each}
						</select>
						{#if editAssignedTo && editAssignedTo !== data.user?.id}
							<p class="mt-1 text-xs text-slate-400">
								They'll see it as pending until they accept.
							</p>
						{/if}
					</div>
				{/if}

				{#if editFreq}
					<p class="text-xs text-slate-400">
						Completing it rolls the due date forward automatically.
					</p>
				{/if}

				<div class="flex justify-end gap-2 pt-1">
					<button
						type="button"
						onclick={closeEdit}
						class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
					>
						Cancel
					</button>
					<button
						type="submit"
						disabled={editSaving || !editTitle.trim()}
						class="rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
					>
						{editSaving ? 'Saving…' : 'Save'}
					</button>
				</div>
			</form>
		</div>
	</div>
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
