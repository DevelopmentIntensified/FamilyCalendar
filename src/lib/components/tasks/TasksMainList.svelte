<script lang="ts">
	import TaskRow, { type TaskRowTask } from './TaskRow.svelte';
	import TaskCompletedRow from './TaskCompletedRow.svelte';
	import TaskToolbar, { type TaskChip, type TaskView, VIEWS } from './TaskToolbar.svelte';
	import {
		bucketCounts,
		sortFlatTasks,
		urgencyBucket,
		TIME_FILTERS,
		type TimeFilter
	} from '$lib/utils/taskUrgency';
	import type { TaskSortKey } from '$lib/utils/taskSort';

	interface Props {
		chip: TaskChip;
		searchQuery: string;
		sortBy: TaskSortKey;
		tagFilter: string;
		/** Which bucket of the queue is on screen. Owned here: it is a view of
		 *  the list, not a URL, exactly like the jump bar's time filter. */
		view?: TaskView;
		openCount: number;
		completedCount: number;
		completedThisWeek: number;
		filteredOpen: TaskRowTask[];
		filteredCompleted: TaskRowTask[];
		currentUserId: string | undefined;
		busyId: string | null;
		celebratingId: string | null;
		confirmDeleteId: string | null;
		confirmClear: boolean;
		clearBusy: boolean;
		assigneeName: (task: TaskRowTask) => string;
		onToggle: (id: string) => void;
		onEdit: (task: TaskRowTask) => void;
		onRespond: (task: TaskRowTask, accept: boolean) => void;
		onAdvance: (id: string) => void;
		onDelete: (id: string) => void;
		onAskDelete: (id: string) => void;
		onCancelDelete: () => void;
		onBeginClear: () => void;
		onCancelClear: () => void;
		onClearCompleted: () => void;
	}

	let {
		chip = $bindable(),
		searchQuery = $bindable(),
		sortBy = $bindable(),
		tagFilter = $bindable(),
		view = $bindable('open'),
		confirmClear = $bindable(),
		openCount,
		completedCount,
		completedThisWeek,
		filteredOpen,
		filteredCompleted,
		currentUserId,
		busyId,
		celebratingId,
		confirmDeleteId,
		clearBusy,
		assigneeName,
		onToggle,
		onEdit,
		onRespond,
		onAdvance,
		onDelete,
		onAskDelete,
		onCancelDelete,
		onBeginClear,
		onCancelClear,
		onClearCompleted
	}: Props = $props();

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

	let tagFilterActive = $derived(tagFilter.trim().length > 0);
	let queryActive = $derived(searchQuery.trim().length > 0);
	let filterActive = $derived(tagFilterActive || queryActive);
	let chipActive = $derived(chip !== 'all');

	/* ── The flat list (issue 101, decision 2) ─────────────────────────────
	   ONE continuous list, no Overdue / Today / Up next headings and no
	   running header — a sticky group heading would re-create the bands. Time
	   is a filter state (the jump bar) and a sort key; each row prints its own
	   date, and an overdue row washes and chips itself (TaskRow). */

	/** Jump-bar state. Local to the list: it is a view of the list, not a URL. */
	let timeFilter = $state<TimeFilter>('all');

	/**
	 * `tasks.html`'s approved owner axis, on top of the flat list. It chooses
	 * WHICH bucket of the queue is on screen — the prototype's own four, in its
	 * own order — and it is a view of the list, not a URL, exactly like the time
	 * jump bar below it.
	 *
	 * OWNER'S RULING — keep the approved labels, fix the lie. The prototype's
	 * third chip paired the label "Assigned to me" with the predicate
	 * `assignedTo !== viewer` (everybody ELSE's). Its own filter code is the
	 * authority for the other chip: `tasks.html:167` has `mine` filtering
	 * `assignedTo === viewer`. So `Mine` filters handed-to-me exactly as the
	 * prototype's code does, and the mislabelled fourth column becomes `Created
	 * me` — the honest name for `userId` is me.
	 *
	 * A previous round answered the same contradiction by renaming the bucket
	 * `Unassigned`, which discarded the approved label and left the account with
	 * no chip for the rows it actually has. `Unassigned` still filters in
	 * `EditTaskDialog` and `FamilyTasksList`; nothing was lost.
	 *
	 * `Open` stays the unfiltered default, not "hide the finished ones".
	 * `b-tasks-flat.html` is approved too, and it decided that finished work
	 * SORTS LAST in one run rather than disappearing — the list is flat, but
	 * finished work is not work. Narrowing the default to open rows would have
	 * quietly undone that, so `Open` narrows nothing and `Done` is the bucket
	 * that shows finished work alone.
	 */
	function inOwnerView(task: TaskRowTask): boolean {
		// Owner's ruling: `Mine` filters what the prototype's own code filters
		// (`tasks.html:167` — `assignedTo` is me). `Created by me` is the column
		// the prototype mislabelled, so it filters `userId` is me.
		if (view === 'mine') return task.assignedTo === currentUserId;
		if (view === 'created') return task.userId === currentUserId;
		return true;
	}
	let viewActive = $derived(view !== 'open');

	/** The open half and the finished half, each cut to the owner bucket. */
	let openRows = $derived(view === 'done' ? [] : filteredOpen.filter(inOwnerView));
	let doneRows = $derived(filteredCompleted.filter(inOwnerView));
	/** Everything the chips/scope/search/tag filter and the owner axis left. */
	let matched = $derived([...openRows, ...doneRows]);
	/** The counts the band headings used to print, now on the jump bar. */
	let counts = $derived(bucketCounts(matched));
	let rows = $derived(
		matched
			.filter((t) => timeFilter === 'all' || urgencyBucket(t) === timeFilter)
			.sort((a, b) => sortFlatTasks(a, b, sortBy))
	);
	let timeActive = $derived(timeFilter !== 'all');
	/** Anything at all narrowing the list. "No tasks here" must only be claimed
	 *  when nothing is switched off — otherwise it is a claim about the account
	 *  that the filters made false. */
	let anyFilterActive = $derived(filterActive || chipActive || viewActive || timeActive);
</script>

<section
	class="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
	aria-labelledby="tasks-list-heading"
>
	<h2 id="tasks-list-heading" class="text-sm font-semibold text-slate-900">Your tasks</h2>
	<p class="mt-0.5 text-xs text-slate-400">Filter, search, and sort your list</p>

	<TaskToolbar
		bind:chip
		bind:searchQuery
		bind:sortBy
		bind:tagFilter
		bind:view
		matchCount={matched.length}
		totalCount={filteredOpen.length + filteredCompleted.length}
	/>

	<!-- The jump bar: time as a filter state, carrying the counts the band
	     headings used to print. Clicking one is a door, not a section. -->
	<div class="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter tasks by time">
		{#each TIME_FILTERS as f (f.value)}
			{@const n = f.value === 'all' ? matched.length : counts[f.value]}
			<button
				type="button"
				onclick={() => (timeFilter = f.value)}
				aria-pressed={timeFilter === f.value}
				class="min-h-[44px] rounded-full border px-3 text-sm font-medium transition-colors {timeFilter ===
				f.value
					? 'border-slate-900 bg-slate-900 text-white'
					: f.value === 'overdue' && n > 0
						? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
						: 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'}"
			>
				{f.label} <span class="font-bold tabular-nums">{n}</span>
			</button>
		{/each}
	</div>

	{#if filterActive || chipActive || viewActive || timeActive}
		<p class="mb-3 text-xs font-medium text-sky-600">
			{#if viewActive}
				Showing <span
					class="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700"
					>{VIEWS.find((v) => v.value === view)?.label} tasks</span
				>
				{#if tagFilterActive || queryActive || chipActive || timeActive}·{/if}
			{/if}
			{#if chipActive}
				Showing
				<span class="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">
					{chip === 'family' ? 'family tasks assigned to you' : `${chip} tasks`}
				</span>
				{#if tagFilterActive || queryActive || timeActive}·{/if}
			{/if}
			{#if tagFilterActive}
				Filtering by <span
					class="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700"
					>#{tagFilter.trim().toLowerCase()}</span
				>
				{#if queryActive || timeActive}·{/if}
			{/if}
			{#if queryActive}
				Searching “{searchQuery.trim()}”
			{/if}
			{#if timeActive}
				{#if queryActive}·{/if}
				<span class="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700"
					>{TIME_FILTERS.find((f) => f.value === timeFilter)?.label}</span
				>
			{/if}
		</p>
	{/if}

	{#if matched.length === 0}
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
				{anyFilterActive ? 'No matching tasks' : CHIP_EMPTY[chip].title}
			</p>
			<p class="text-sm text-slate-500">
				{anyFilterActive
					? 'Try another chip, or clear the search and filters'
					: CHIP_EMPTY[chip].hint}
			</p>
		</div>
	{/if}

	<!-- ONE list. Open and finished rows sit in the same run, ordered by
	     urgency; finished work sorts last and strikes itself. -->
	<div class="space-y-1.5">
		{#each rows as task (task.id)}
			{#if task.completedAt}
				<TaskCompletedRow
					{task}
					busy={busyId === task.id}
					confirmDelete={confirmDeleteId === task.id}
					onToggle={() => onToggle(task.id)}
					onDelete={() => onDelete(task.id)}
					onAskDelete={() => onAskDelete(task.id)}
					{onCancelDelete}
				/>
			{:else}
				<TaskRow
					{task}
					{currentUserId}
					assigneeName={assigneeName(task)}
					busy={busyId === task.id}
					celebrating={celebratingId === task.id}
					confirmDelete={confirmDeleteId === task.id}
					onToggle={() => onToggle(task.id)}
					onEdit={() => onEdit(task)}
					onAccept={() => onRespond(task, true)}
					onDecline={() => onRespond(task, false)}
					onAdvance={() => onAdvance(task.id)}
					onDelete={() => onDelete(task.id)}
					onAskDelete={() => onAskDelete(task.id)}
					{onCancelDelete}
				/>
			{/if}
		{/each}
	</div>

	{#if matched.length > 0 && rows.length === 0}
		<p
			class="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-500"
		>
			Nothing {TIME_FILTERS.find((f) => f.value === timeFilter)?.label.toLowerCase()} right now.
			<button
				type="button"
				onclick={() => (timeFilter = 'all')}
				class="font-semibold text-primary-600 hover:underline">Show all {matched.length}</button
			>
		</p>
	{/if}

	{#if openCount === 0 && completedCount > 0 && !anyFilterActive}
		<div class="rounded-xl border border-dashed border-slate-200 py-10 text-center">
			<p class="text-sm font-medium text-emerald-600">All caught up 🎉</p>
			<p class="text-sm text-slate-500">Nothing open right now</p>
		</div>
	{/if}

	<!-- Clearing finished work is a list-level action now; it used to hang off
	     the "Completed" band heading, which the flat list does not have. -->
	{#if filteredCompleted.length > 0}
		<div class="mt-6 flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
			{#if completedThisWeek > 0}
				<span class="mr-auto text-xs text-emerald-600"
					>· {completedThisWeek} completed this week</span
				>
			{/if}
			{#if confirmClear}
				<span class="text-xs font-medium text-red-600">Delete all completed?</span>
				<button
					type="button"
					onclick={onClearCompleted}
					disabled={clearBusy}
					class="rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
				>
					{clearBusy ? 'Deleting…' : 'Yes, delete'}
				</button>
				<button
					type="button"
					onclick={onCancelClear}
					disabled={clearBusy}
					class="rounded-full bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-300"
				>
					No
				</button>
			{:else}
				<button
					type="button"
					class="text-xs font-medium text-slate-400 transition-colors hover:text-red-500"
					onclick={onBeginClear}
				>
					Clear completed
				</button>
			{/if}
		</div>
	{/if}
</section>
