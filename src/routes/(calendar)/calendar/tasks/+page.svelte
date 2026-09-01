<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import MentionInput from '$lib/components/MentionInput.svelte';
	import TaskQuickAddPreview from '$lib/components/TaskQuickAddPreview.svelte';
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
	import { sortByCompletedDesc, sortTasks, type TaskSortKey } from '$lib/utils/taskSort';
	import { showRecurringCompleteFeedback, showRecurringSkipFeedback } from '$lib/client/taskFeedback';

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
		userId: string;
		eventId: string | null;
		eventTitle?: string | null;
		eventStart?: string | Date | null;
		createdAt?: string | Date | number | null;
		tags?: string[];
	};

	let newTitle = '';
	let newDueDate = '';
	let adding = false;
	let busyId: string | null = null;
	let busyTemplateId: string | null = null;
	let actionError = '';
	let tagFilter = '';
	let searchQuery = '';
	let sortBy: TaskSortKey = 'due';

	// Edit dialog
	const FREQ_OPTIONS = [
		{ value: '', label: "Doesn't repeat" },
		{ value: 'daily', label: 'Daily' },
		{ value: 'weekly', label: 'Weekly' },
		{ value: 'monthly', label: 'Monthly' },
		{ value: 'yearly', label: 'Yearly' }
	];
	const FREQ_NOUN: Record<string, string> = {
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
	let editSaving = false;

	$: data.familyMembers = data.familyMembers ?? [];
	$: familyRoster = (data.familyMembers || []) as {
		userId: string;
		firstName: string;
		lastName: string;
		email: string;
	}[];

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
		return isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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
				assignmentStatus = assignedTo ? (assignedTo === data.user?.id ? 'accepted' : 'pending') : null;
			}
			const res = await fetch(`/api/tasks/${editing.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: editTitle.trim(),
					notes: editNotes.trim() || null,
					dueDate: inputToIso(editDue),
					recurrenceFrequency: editFreq || null,
					recurrenceInterval: editFreq ? Math.max(1, Math.floor(editInterval)) : null,
					assignedTo,
					priority: editPriority,
					tags: parseEditTags(editTags),
					...(assignmentStatus ? { assignmentStatus } : {})
				})
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
	let completedOverride: Record<string, boolean> = {};

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

	$: openTasks = (data.tasks as TaskItem[]).filter(
		(t) => (t.id in completedOverride ? completedOverride[t.id] : !!t.completedAt) === false
	);
	$: completedTasks = (data.tasks as TaskItem[]).filter(
		(t) => (t.id in completedOverride ? completedOverride[t.id] : !!t.completedAt) === true
	);

	$: sortedOpenTasks = [...openTasks].sort((a, b) => sortTasks(a, b, sortBy));
	$: sortedCompletedTasks = [...completedTasks].sort(sortByCompletedDesc);
	$: queryActive = searchQuery.trim().length > 0;

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
	$: filteredOpenTasks = sortedOpenTasks.filter((t) => matchesTagFilter(t.tags) && matchesSearch(t));
	$: filteredCompletedTasks = sortedCompletedTasks.filter(
		(t) => matchesTagFilter(t.tags) && matchesSearch(t)
	);
	$: tagFilterActive = tagFilter.trim().length > 0;
	$: filterActive = tagFilterActive || queryActive;
	const PRIORITY_DOT: Record<string, string> = {
		high: 'bg-red-500',
		normal: 'bg-slate-300',
		low: 'bg-sky-500'
	};

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

	function isOverdue(task: TaskItem): boolean {
		if (!task.dueDate || task.completedAt) return false;
		return new Date(task.dueDate).getTime() < Date.now();
	}

	async function addTask() {
		if (!newTitle.trim()) return;
		adding = true;
		actionError = '';
		try {
			const parsed = parseTaskQuickAdd(newTitle, { members: familyRoster });
			// A cadence ("every 2 weeks") with no picked date still needs a cursor.
			const due = parsed.dueDate ?? (newDueDate || null) ?? (parsed.recurrenceFrequency ? endOfDayIso() : null);
			const res = await fetch('/api/tasks', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: parsed.title,
					dueDate: due,
					priority: parsed.priority,
					assignedTo: parsed.assignedTo,
					tags: parsed.tags,
					recurrenceFrequency: parsed.recurrenceFrequency,
					recurrenceInterval: parsed.recurrenceInterval
				})
			});
			if (res.ok) {
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
		const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[t.recurrenceFrequency];
		const units = { daily: 'days', weekly: 'weeks', monthly: 'months', yearly: 'years' }[t.recurrenceFrequency];
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
			if (res.ok) await invalidateAll();
		} finally {
			busyTemplateId = null;
		}
	}

	async function toggleTask(id: string) {
		const task = (data.tasks as TaskItem[]).find((t) => t.id === id);
		if (!task || busyId) return;
		const completing = !(task.id in completedOverride ? completedOverride[task.id] : !!task.completedAt);
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
		const { [id]: _dropped, ...rest } = completedOverride;
		completedOverride = rest;
	}

	function celebrate(id: string) {
		clearTimeout(celebrateTimer);
		celebratingId = id;
		if ('vibrate' in navigator) navigator.vibrate?.(15);
		celebrateTimer = setTimeout(() => (celebratingId = null), 900);
	}

	async function deleteTask(id: string) {
		if (!confirm('Delete this task?')) return;
		busyId = id;
		actionError = '';
		try {
			const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
			if (!res.ok) {
				const j = await res.json().catch(() => ({}));
				actionError = j.error || "That didn't work. Try again.";
			} else {
				await invalidateAll();
			}
		} catch {
			actionError = 'Network problem. Try again.';
		} finally {
			busyId = null;
		}
	}

	async function clearCompleted() {
		if (!confirm('Delete all completed tasks? This can\'t be undone.')) return;
		actionError = '';
		try {
			const res = await fetch('/api/tasks/completed', { method: 'DELETE' });
			if (!res.ok) {
				const j = await res.json().catch(() => ({}));
				actionError = j.error || "That didn't work. Try again.";
				return;
			}
			await invalidateAll();
		} catch {
			// Network error — queue for retry when back online
			await queueMutation('/api/tasks/completed', 'DELETE', null);
			actionError = '';
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
		<div class="flex-1">
			<MentionInput
				bind:value={newTitle}
				members={familyRoster}
				placeholder="Add a task... e.g. #groceries"
			/>
			<TaskQuickAddPreview parsed={quick} {memberName} {formatDue} />
			<p class="mt-1 text-xs text-slate-400">Tip: type <span class="font-mono text-slate-500">"every 2 weeks"</span> for a repeat, or <span class="font-mono text-slate-500">#tag</span> to tag (e.g. <span class="font-mono text-slate-500">#groceries</span>).</p>
		</div>
		<input
			type="date"
			bind:value={newDueDate}
			aria-label="Due date"
			class="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-600 sm:w-[10.5rem]"
		/>
		<button
			type="submit"
			disabled={adding || !newTitle.trim()}
			class="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
		>
			Add
		</button>
	</form>

	<!-- Smart task templates -->
	<details class="group mb-6">
		<summary class="flex w-fit cursor-pointer select-none items-center gap-1 rounded-full px-2 py-0.5 text-xs text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600">
			<span>✨ Smart tasks</span>
			<svg class="h-3 w-3 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
			</svg>
		</summary>
		<div class="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
			{#each Object.keys(CATEGORY_META) as cat}
				{@const templates = SMART_EVENT_TEMPLATES.filter((t) => t.category === (cat as SmartEventCategory))}
				<details class="mb-1 last:mb-0" open={Object.keys(CATEGORY_META).indexOf(cat) === 0}>
					<summary class="cursor-pointer select-none rounded-lg px-2 py-1.5 text-sm font-medium text-slate-700 hover:bg-white">
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
								class="rounded-full border px-2.5 py-1 text-xs font-medium transition-colors hover:opacity-80 disabled:opacity-50 {CATEGORY_META[template.category].color}"
							>
								{template.name}
							</button>
						{/each}
					</div>
				</details>
			{/each}
		</div>
	</details>

	{#if actionError}
		<div
			role="alert"
			class="mb-4 flex items-center justify-between gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600"
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
				<svg class="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
				</svg>
				{#if searchQuery}
					<button
						type="button"
						onclick={() => (searchQuery = '')}
						class="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
						aria-label="Clear search"
						title="Clear search"
					>
						<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
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
			<input
				type="text"
				bind:value={tagFilter}
				placeholder="Filter by tag…"
				aria-label="Filter tasks by tag"
				class="w-full rounded-lg border border-slate-300 bg-white py-2 pl-8 pr-8 text-sm text-slate-700 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
			/>
			<svg class="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
			</svg>
			{#if tagFilter}
				<button
					type="button"
					onclick={() => (tagFilter = '')}
					class="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
					aria-label="Clear tag filter"
					title="Clear filter"
				>
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			{/if}
		</div>
	</div>
	{#if filterActive}
		<p class="mb-3 text-xs font-medium text-sky-600">
			{#if tagFilterActive}
				Filtering by <span class="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">#{tagFilter.trim().toLowerCase()}</span>
				{#if queryActive}· {/if}
			{/if}
			{#if queryActive}
				Searching “{searchQuery.trim()}”
			{/if}
		</p>
	{/if}

	{#if filteredOpenTasks.length === 0 && filteredCompletedTasks.length === 0}
		<div class="flex flex-col items-center justify-center py-16 text-center">
			<svg class="mb-4 h-14 w-14 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
			</svg>
			<p class="text-lg font-medium text-slate-700">{filterActive ? 'No matching tasks' : 'No tasks yet'}</p>
			<p class="text-sm text-slate-500">{filterActive ? 'Try a different search or clear the filters' : 'Add your first task above'}</p>
		</div>
	{/if}

	<!-- Open tasks -->
	{#if filteredOpenTasks.length > 0}
		<h2 class="mb-2 flex items-baseline gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
			<span>Open ({filteredOpenTasks.length})</span>
		</h2>
	{/if}
	<div class="space-y-1.5">
		{#each filteredOpenTasks as task (task.id)}
			<div
				class="group flex flex-wrap items-center gap-3 overflow-hidden rounded-xl border border-slate-200 bg-white p-3 transition-all hover:border-slate-300 active:bg-slate-100 {celebratingId === task.id ? 'celebrate' : ''}"
			>
				<button
					type="button"
					onclick={() => toggleTask(task.id)}
					disabled={busyId === task.id}
					class="relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-slate-300 transition-colors hover:border-primary-500 active:border-primary-500"
					aria-label="Complete task"
				>
					<span class="absolute -inset-2" aria-hidden="true"></span>
				</button>
							<div class="min-w-0 flex-1">
								<button
									type="button"
									onclick={() => openEdit(task)}
									class="block w-full truncate text-left text-sm font-medium text-slate-900 hover:text-primary-600"
									title="Edit task"
								>
									{task.title}
								</button>
								{#if task.recurrenceFrequency}
									<p class="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-purple-500">
										<svg class="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
											<path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h5M20 20v-5h-5M4 9a8 8 0 0114-3m2 9a8 8 0 01-14 3" />
										</svg>
										{task.recurrenceInterval && task.recurrenceInterval > 1
											? `every ${task.recurrenceInterval} ${FREQ_NOUN[task.recurrenceFrequency] ?? task.recurrenceFrequency}s`
											: `every ${FREQ_NOUN[task.recurrenceFrequency] ?? task.recurrenceFrequency}`}
										{#if task.completionCount}
											<span class="ml-0.5 inline-flex items-center gap-0.5 rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-600">
												🔥 {task.completionCount}×
											</span>
										{/if}
									</p>
								{:else if task.eventTitle}
									<p class="mt-0.5 flex items-center gap-1 truncate text-xs font-medium text-primary-500">
										<svg class="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
										</svg>
										{task.eventTitle}
									</p>
								{:else if task.notes}
									<p class="truncate text-xs text-slate-500">{task.notes}</p>
								{/if}
								{#if (task.tags ?? []).length > 0}
									<div class="mt-1 flex flex-wrap gap-1">
										{#each task.tags ?? [] as tag}
											<span class="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">#{tag}</span>
										{/each}
									</div>
								{/if}
							</div>
				{#if task.dueDate}
					<span class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium {isOverdue(task) ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}">
						{formatDue(task.dueDate)}
					</span>
				{/if}
				{#if task.priority && task.priority !== 'normal'}
					<span class="h-2 w-2 shrink-0 rounded-full {PRIORITY_DOT[task.priority]}" title="Priority: {task.priority}"></span>
				{/if}
				{#if task.assignedTo && task.assignmentStatus !== 'none' && !(task.assignedTo === task.userId && task.assignmentStatus === 'accepted')}
					{@const mine = task.assignedTo === data.user?.id}
					{@const pending = task.assignmentStatus === 'pending'}
					{#if mine && pending}
						<span class="flex shrink-0 items-center gap-1">
							<button
								type="button"
								onclick={() => respondAssignment(task, true)}
								disabled={busyId === task.id}
								class="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-200 active:bg-emerald-200"
								title="Accept"
							>
								✓ Accept
							</button>
							<button
								type="button"
								onclick={() => respondAssignment(task, false)}
								disabled={busyId === task.id}
								class="rounded-full bg-red-100 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-200 active:bg-red-200"
								title="Decline"
							>
								✕
							</button>
						</span>
					{:else}
						<span
							class="flex shrink-0 items-center gap-1 rounded-full bg-slate-100 py-0.5 pl-0.5 pr-2 text-xs font-medium text-slate-600"
							title="Assigned to {memberName(task.assignedTo)}"
						>
							<span class="flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold {avatarColor(task.assignedTo)}">
								{(task.assigneeFirstName?.[0] ?? memberName(task.assignedTo)[0] ?? '?').toUpperCase()}
							</span>
							{memberName(task.assignedTo).split(' ')[0]}
							{#if task.assignmentStatus === 'pending'}
								<span class="rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-700">pending</span>
							{/if}
						</span>
					{/if}
				{/if}
				{#if task.recurrenceFrequency && !task.completedAt}
					<button
						type="button"
						onclick={() => advanceTask(task.id)}
						disabled={busyId === task.id}
						class="relative shrink-0 rounded-full p-2 text-slate-300 pointer-fine:opacity-0 transition-all hover:bg-purple-100 hover:text-purple-500 active:bg-purple-100 pointer-fine:group-hover:opacity-100"
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
					class="relative shrink-0 rounded-full p-2 text-slate-300 pointer-fine:opacity-0 transition-all hover:bg-red-50 hover:text-red-500 active:bg-red-50 pointer-fine:group-hover:opacity-100"
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
	{#if filteredCompletedTasks.length > 0}
		<h2 class="mb-2 mt-8 flex items-baseline gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
			<span>Completed ({filteredCompletedTasks.length})</span>
			{#if completedThisWeek > 0}
				<span class="ml-1 font-normal normal-case text-emerald-600">· {completedThisWeek} this week</span>
			{/if}
			<button
				type="button"
				class="ml-auto font-medium normal-case text-slate-400 transition-colors hover:text-red-500"
				onclick={clearCompleted}
			>
				Clear completed
			</button>
		</h2>
		<div class="space-y-1.5">
			{#each filteredCompletedTasks as task (task.id)}
				<div class="group flex flex-wrap items-center gap-3 overflow-hidden rounded-xl bg-slate-50 p-3 active:bg-slate-100 {celebratingId === task.id ? 'celebrate' : ''}">
					<button
						type="button"
						onclick={() => toggleTask(task.id)}
						disabled={busyId === task.id}
						class="relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-500 text-white active:bg-primary-600"
						aria-label="Mark incomplete"
					>
						<span class="absolute -inset-2" aria-hidden="true"></span>
						<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
							<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
						</svg>
					</button>
								<p class="min-w-0 flex-1 truncate text-sm text-slate-400 line-through">
										{task.title}
										{#if task.eventTitle}<span class="ml-1 text-xs font-normal text-slate-400 no-underline">({task.eventTitle})</span>{/if}
									</p>
								{#if (task.tags ?? []).length > 0}
									<div class="flex flex-wrap gap-1">
										{#each task.tags ?? [] as tag}
											<span class="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">#{tag}</span>
										{/each}
									</div>
								{/if}
					<button
						type="button"
						onclick={() => deleteTask(task.id)}
						disabled={busyId === task.id}
						class="relative shrink-0 rounded-full p-2 text-slate-300 pointer-fine:opacity-0 transition-all hover:bg-red-50 hover:text-red-500 active:bg-red-50 pointer-fine:group-hover:opacity-100"
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

<!-- Edit task dialog -->
{#if editing}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
		onclick={closeEdit}
		onkeydown={(e) => e.key === 'Escape' && closeEdit()}
		role="presentation"
	>
		<div
			class="w-full max-w-md rounded-xl bg-white shadow-2xl"
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
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
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
					<label for="edit-title" class="mb-1 block text-sm font-medium text-slate-700">Title *</label>
					<input
						id="edit-title"
						type="text"
						bind:value={editTitle}
						required
						class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
					/>
				</div>

				<div>
					<label for="edit-notes" class="mb-1 block text-sm font-medium text-slate-700">Notes</label>
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

				<div class="grid grid-cols-3 gap-3">
					<div>
						<label for="edit-due" class="mb-1 block text-sm font-medium text-slate-700">Due date</label>
						<input
							id="edit-due"
							type="date"
							bind:value={editDue}
							class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
						/>
					</div>
					<div>
						<label for="edit-priority" class="mb-1 block text-sm font-medium text-slate-700">Priority</label>
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
						<label for="edit-freq" class="mb-1 block text-sm font-medium text-slate-700">Repeats</label>
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
						<span class="text-sm text-purple-800">{FREQ_NOUN[editFreq]}{editInterval > 1 ? 's' : ''}</span>
					</div>
				{/if}

				{#if familyRoster.length > 0}
					<div>
						<label for="edit-assignee" class="mb-1 block text-sm font-medium text-slate-700">Assign to</label>
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
							<p class="mt-1 text-xs text-slate-400">They'll see it as pending until they accept.</p>
						{/if}
					</div>
				{/if}

				{#if editFreq}
					<p class="text-xs text-slate-400">Completing it rolls the due date forward automatically.</p>
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
