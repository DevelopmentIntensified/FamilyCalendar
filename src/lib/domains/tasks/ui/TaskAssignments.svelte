<!--
	Assignments: one band, two stacked sections — "To accept" (handed to me) and
	"You asked for" (I handed it out). Both queues are visible at once (no tabs),
	each row framed, each answer its own labelled button.

	Legacy reference: `components/tasks/AssignmentsCard.svelte`.
-->
<script lang="ts">
	import Pill from '$lib/kernel/ui/Pill.svelte';
	import type { TaskPageRow } from '../tasks.contract';
	import type { TasksPageState } from '../tasks.page.state.svelte';
	import { formatTaskDue } from '../tasks.display.rules';

	interface Props {
		state: TasksPageState;
	}

	let { state }: Props = $props();

	function nameOf(task: TaskPageRow): string {
		return task.assignedTo ? state.memberName(task.assignedTo) : 'someone';
	}
</script>

<section
	data-testid="assignments-band"
	class="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
>
	<div class="flex items-baseline justify-between gap-2">
		<h2 class="text-sm font-semibold text-slate-900">Assignments</h2>
		<span class="text-xs text-slate-400"
			>{state.pendingAssignments.length + state.requestedByMe.length} waiting</span
		>
	</div>
	<p class="mt-0.5 text-xs leading-relaxed text-slate-400">
		Tasks you've been sent, and ones you sent out. Both are open.
	</p>

	<h3 class="mb-2 mt-3 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-slate-500">
		To accept ({state.pendingAssignments.length})
	</h3>
	{#if state.pendingAssignments.length === 0}
		<p class="py-4 text-center text-sm text-slate-500">
			Nothing waiting for you — you're all caught up.
		</p>
	{:else}
		<div class="space-y-2">
			{#each state.pendingAssignments as task (task.id)}
				<div data-testid="inbox-row" class="rounded-xl border border-amber-200 bg-amber-50/80 px-2.5 py-2">
					<div class="min-w-0">
						<p class="truncate text-sm font-medium text-slate-900">{task.title}</p>
						<p class="mt-0.5 truncate text-[0.6875rem] text-slate-500">
							From {task.creatorFirstName ?? 'someone'} · due {formatTaskDue(task.dueDate)}
							{#if task.familyId}· <span class="font-medium text-indigo-600">Family</span>{/if}
						</p>
					</div>
					<div data-testid="inbox-respond" class="mt-1.5 flex items-center gap-1.5">
						<button
							type="button"
							onclick={() => state.respond(task, true)}
							disabled={state.busyId === task.id}
							class="min-h-[28px] shrink-0 rounded-full bg-emerald-600 px-3 py-1 text-[0.6875rem] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
							title="Accept"
						>
							✓ Accept
						</button>
						<button
							type="button"
							onclick={() => state.respond(task, false)}
							disabled={state.busyId === task.id}
							class="min-h-[28px] shrink-0 rounded-full bg-red-100 px-3 py-1 text-[0.6875rem] font-bold text-red-700 hover:bg-red-200 disabled:opacity-50"
							title="Decline"
						>
							✕ Decline
						</button>
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<h3 class="mb-2 mt-4 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-slate-500">
		You asked for ({state.requestedByMe.length})
	</h3>
	{#if state.requestedByMe.length === 0}
		<p class="py-4 text-center text-sm text-slate-500">
			You haven't assigned anything out. Assign a task from the list above to see its status here.
		</p>
	{:else}
		<div class="space-y-2">
			{#each state.requestedByMe as task (task.id)}
				<div
					data-testid="inbox-row-sent"
					class="rounded-xl border border-slate-100 bg-slate-50/60 px-2.5 py-2"
				>
					<div class="flex min-w-0 items-center justify-between gap-2">
						<div class="min-w-0">
							<p class="truncate text-sm font-medium text-slate-900">{task.title}</p>
							<p class="mt-0.5 truncate text-[0.6875rem] text-slate-500">
								To {nameOf(task)}
								{#if task.familyId}· <span class="font-medium text-indigo-600">Family</span>{/if}
							</p>
						</div>
						<Pill
							tone={task.assignmentStatus === 'accepted'
								? 'success'
								: task.assignmentStatus === 'declined'
									? 'neutral'
									: 'warning'}
							size="compact"
							testid="inbox-status"
						>
							{task.assignmentStatus ?? 'pending'}
						</Pill>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</section>
