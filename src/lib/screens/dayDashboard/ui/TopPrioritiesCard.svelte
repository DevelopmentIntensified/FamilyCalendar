<!--
	Top-3 Priorities: the ranked rows in two labelled groups (One-off, then
	Recurring) with continuous numbering, the complete circle, the assignee and
	scope pills, the category, the due pill and the three priority buttons.

	Writes go through the screen's state class; this file is layout and copy.
	Legacy reference: `components/dashboard/TopPrioritiesCard.svelte` (203).
-->
<script lang="ts">
	import { splitTasksByRecurrence, taskPriorityLabel } from '$lib/domains/tasks';
	import type { DashboardUserTaskRow } from '../dayDashboard.contract';
	import {
		DASHBOARD_PRIORITY_ORDER,
		dashboardDueTone,
		dashboardPriorityTone
	} from '../dayDashboard.cards.rules';
	import type { DayDashboardState } from '../dayDashboard.state.svelte';

	interface Props {
		tasks: readonly DashboardUserTaskRow[];
		meId: string;
		state: DayDashboardState;
		now: Date;
	}

	let { tasks, meId, state, now }: Props = $props();

	const split = $derived(splitTasksByRecurrence(tasks));
	const groups = $derived([
		{ id: 'one-off', label: 'One-off', list: split.oneOff, start: 0 },
		{
			id: 'recurring',
			label: 'Recurring',
			list: split.recurring,
			start: split.oneOff.length
		}
	]);

	function memberName(task: DashboardUserTaskRow): string {
		if (task.assignedTo === meId) return 'You';
		const name = `${task.assigneeFirstName ?? ''} ${task.assigneeLastName ?? ''}`.trim();
		return name || 'Unassigned';
	}

	function assigneeBadge(task: DashboardUserTaskRow): string {
		if (!task.assignedTo || task.assignedTo === meId) return '';
		return `${task.assigneeFirstName ?? ''} ${task.assigneeLastName ?? ''}`.trim();
	}

	function dueLabel(due: string | null): string {
		if (!due) return '';
		const at = new Date(due);
		return Number.isNaN(at.getTime())
			? ''
			: at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}
</script>

<div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
	<h2 class="mb-3 flex items-center justify-between text-sm font-semibold text-slate-900">
		Top-3 Priorities
		{#if tasks.length === 0}
			<span class="text-xs font-normal text-slate-400">All clear</span>
		{/if}
	</h2>

	{#if tasks.length === 0}
		<div
			class="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-400"
		>
			<p>All clear — nothing needs you right now.</p>
			<a
				href="/calendar/tasks"
				class="mt-1 inline-block text-xs font-semibold text-primary-600 hover:text-primary-700 hover:underline"
			>
				View all tasks →
			</a>
		</div>
	{:else}
		{#snippet ranked(task: DashboardUserTaskRow, displayNumber: number)}
			<li class="flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-3">
				<span class="w-4 shrink-0 select-none text-center text-xs font-bold text-slate-300">
					{displayNumber}
				</span>
				<button
					type="button"
					onclick={() => void state.toggleTask(task)}
					disabled={state.busyTaskId === task.id}
					class="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-slate-300 transition-colors enabled:hover:border-primary-500 disabled:opacity-40"
					title="Mark done"
					aria-label="Mark done: {task.title}"
					><span class="absolute -inset-2" aria-hidden="true"></span></button
				>
				<div class="min-w-0 flex-1">
					<p class="truncate text-sm font-medium text-slate-900">{task.title}</p>
					{#if assigneeBadge(task)}
						<span
							class="mt-0.5 inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
							title="Assigned to {assigneeBadge(task)}"
						>
							→ {assigneeBadge(task)}
						</span>
					{:else}
						<p class="text-[11px] text-slate-400">{memberName(task)}</p>
					{/if}
					<div class="mt-0.5 flex flex-wrap items-center gap-1">
						{#if task.familyId}
							<span
								class="inline-flex items-center rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700"
								title="Family task"
							>
								Family
							</span>
						{:else}
							<span
								class="inline-flex items-center rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500"
								title={task.visibility === 'private'
									? 'Private — only you and the assignee'
									: 'Public — family can see it (read-only)'}
							>
								{task.visibility === 'private' ? 'Private' : 'Public'}
							</span>
						{/if}
						{#if task.category?.trim()}
							<span
								data-testid="category-chip"
								title="Category: {task.category.trim()}"
								class="inline-flex max-w-[10rem] shrink-0 items-center truncate rounded-full bg-teal-100 px-1.5 py-0.5 text-[10px] font-medium text-teal-800"
								>{task.category.trim()}</span
							>
						{/if}
					</div>
				</div>
				{#if task.dueDate}
					<span class="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium {dashboardDueTone(task.dueDate, now)}">
						{dueLabel(task.dueDate)}
					</span>
				{/if}
				<div class="flex shrink-0 flex-wrap items-center gap-0.5" title="Priority">
					{#each DASHBOARD_PRIORITY_ORDER as priority (priority)}
						<button
							type="button"
							onclick={() => void state.setPriority(task, priority)}
							disabled={state.busyTaskId === task.id || task.priority === priority}
							class="min-h-11 rounded-md px-2.5 text-[11px] font-semibold transition-colors {task.priority ===
							priority
								? dashboardPriorityTone(priority)
								: 'text-slate-300 hover:bg-slate-100 hover:text-slate-500'}"
							aria-label="Set priority {taskPriorityLabel(priority)}"
							title="{taskPriorityLabel(priority)} priority"
						>
							{taskPriorityLabel(priority)}
						</button>
					{/each}
				</div>
			</li>
		{/snippet}

		{#each groups as group (group.id)}
			{#if group.list.length > 0}
				<div class="mb-3 last:mb-0" data-testid="top3-{group.id}">
					<h3
						class="mb-1.5 flex items-baseline gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400"
					>
						{group.label}
						<span data-testid="top3-count" class="tabular-nums">({group.list.length})</span>
					</h3>
					<ol class="space-y-2" start={group.start + 1}>
						{#each group.list as task, index (task.id)}
							{@render ranked(task, group.start + index + 1)}
						{/each}
					</ol>
				</div>
			{/if}
		{/each}
	{/if}
	<div class="mt-3 text-right">
		<a
			href="/calendar/tasks"
			class="text-xs font-semibold text-primary-600 hover:text-primary-700 hover:underline"
		>
			View all tasks →
		</a>
	</div>
</div>
