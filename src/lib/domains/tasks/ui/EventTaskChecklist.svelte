<!--
	The Event modal's checklist: the Event's Tasks with inline add, complete and
	remove, plus the pending titles the create flow queues before the Event
	exists. Reports the attached count so the parent can warn before deleting an
	Event that still has Tasks.

	What calendar's event modal embeds (rule R1: calendarPage passes it in as a
	snippet; tasks is the higher rank). Legacy reference:
	`components/calendar/ChecklistSection.svelte`.
-->
<script lang="ts">
	import Skeleton from '$lib/kernel/ui/Skeleton.svelte';
	import { createTasksApi, type TasksApi } from '../tasks.api';
	import {
		EventTaskChecklistState,
		type TaskChecklistOptions
	} from '../tasks.checklist.state.svelte';

	interface Props {
		eventId?: string | null;
		pendingTitles?: readonly string[];
		onPendingTitlesChange?: TaskChecklistOptions['onPendingTitlesChange'];
		onAttachedCountChange?: TaskChecklistOptions['onAttachedCountChange'];
		api?: TasksApi;
	}

	let {
		eventId = null,
		pendingTitles = [],
		onPendingTitlesChange,
		onAttachedCountChange,
		api = createTasksApi()
	}: Props = $props();

	const state = new EventTaskChecklistState({
		api,
		eventId,
		pendingTitles,
		onPendingTitlesChange,
		onAttachedCountChange
	});

	$effect(() => {
		void state.load(eventId);
	});
	$effect(() => {
		state.syncPending(pendingTitles);
	});
	// Report once per actual count change (the callback's identity changes on
	// every parent render, so key on the value instead).
	let reportedCount: number | null = null;
	$effect(() => {
		if (state.attachedCount !== reportedCount) {
			reportedCount = state.attachedCount;
			onAttachedCountChange?.(state.attachedCount);
		}
	});

	const doneCount = $derived(state.rows.filter((row) => row.completedAt).length);

	function submit(event: SubmitEvent) {
		event.preventDefault();
		void state.add();
	}
</script>

<div class="border-t border-slate-100 px-5 py-3">
	<div class="mb-1 flex items-center justify-between">
		<h4 class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
			Checklist{#if state.rows.length > 0}· {doneCount}/{state.rows.length}{/if}
		</h4>
		{#if !state.showInput}
			<button
				type="button"
				class="rounded px-2.5 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-100 hover:text-primary-600"
				onclick={() => (state.showInput = true)}
			>
				+ Add task
			</button>
		{/if}
	</div>

	<ul class="space-y-0.5">
		{#if state.loading}
			<li data-testid="checklist-skeleton">
				<Skeleton shape="row" lines={2} label="Loading checklist" testid="checklist-skeleton-rows" />
			</li>
		{/if}
		{#each state.pending as title, index (title + index)}
			<li class="flex items-center gap-2 rounded px-1 py-1">
				<span class="h-4 w-4 shrink-0 rounded-full border border-dashed border-slate-300"></span>
				<span class="min-w-0 flex-1 truncate text-sm text-slate-700">{title}</span>
				<button
					type="button"
					class="shrink-0 rounded p-1.5 text-slate-300 hover:text-red-500"
					aria-label="Remove task"
					onclick={() => state.removePending(index)}
				>
					<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</li>
		{/each}
		{#each state.rows as task (task.id)}
			<li class="group flex items-center gap-2 rounded px-1 py-1 hover:bg-slate-50">
				<button
					type="button"
					disabled={state.busy}
					onclick={() => state.toggle(task.id)}
					class="relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full border {task.completedAt
						? 'border-primary-500 bg-primary-500 text-white'
						: 'border-slate-300 hover:border-primary-400'}"
					aria-label={task.completedAt ? 'Mark incomplete' : 'Complete'}
				>
					<span class="absolute -inset-2" aria-hidden="true"></span>
					{#if task.completedAt}
						<svg class="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
							<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
						</svg>
					{/if}
				</button>
				<span class="min-w-0 flex-1 truncate text-sm {task.completedAt
					? 'text-slate-400 line-through'
					: 'text-slate-700'}">
					{task.title}
				</span>
				<button
					type="button"
					disabled={state.busy}
					onclick={() => state.remove(task.id)}
					class="shrink-0 rounded p-1.5 text-slate-300 opacity-100 transition-all hover:text-red-500 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
					aria-label="Remove task"
				>
					<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</li>
		{/each}
	</ul>

	{#if state.showInput}
		<form class="mt-1.5" onsubmit={submit}>
			<div class="flex gap-1.5">
				<input
					type="text"
					value={state.draftTitle}
					oninput={(event) => (state.draftTitle = event.currentTarget.value)}
					placeholder="Add a task..."
					class="flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-primary-500 focus:outline-none"
				/>
				<button
					type="submit"
					disabled={state.busy || !state.draftTitle.trim()}
					class="rounded-lg bg-primary-600 px-3 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
				>
					Add
				</button>
				<button
					type="button"
					class="rounded-lg px-2 text-sm text-slate-400 hover:text-slate-600"
					onclick={() => state.closeInput()}
				>
					Done
				</button>
			</div>
			{#if state.error}
				<p role="alert" class="mt-1 text-xs text-red-600">{state.error}</p>
			{/if}
		</form>
	{/if}
</div>
