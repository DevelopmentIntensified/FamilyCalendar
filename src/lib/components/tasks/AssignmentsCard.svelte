<script lang="ts">
	/** Structural row shape — both task pages pass their local TaskItem. */
	export interface AssignmentRow {
		id: string;
		title: string;
		dueDate: string | null;
		familyId?: string | null;
		creatorFirstName?: string | null;
		assignedTo?: string | null;
		assignmentStatus?: string | null;
	}

	interface Props {
		pending: AssignmentRow[];
		requested: AssignmentRow[];
		busyId: string | null;
		formatDue: (due: string | null) => string;
		memberName: (userId: string) => string;
		onRespond: (task: AssignmentRow, accept: boolean) => void;
	}

	let { pending, requested, busyId, formatDue, memberName, onRespond }: Props = $props();
</script>

<!-- tasks.html, approved, and b-tasks-flat.html beside it: ONE band, TWO
     stacked sections. The app had a `role="tablist"` here, and a tab hides half
     a band — the point of this band is that both queues are visible at once, so
     the two answers ("someone asked me" / "I asked someone") are sections with
     their own headings and counts, not tabs.

     Every row is framed and the two answers get a LINE of their own rather than
     a column of buttons squeezing the title: the affordance is the point. -->
<section
	data-testid="assignments-band"
	class="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
>
	<div class="flex items-baseline justify-between gap-2">
		<h2 class="text-sm font-semibold text-slate-900">Assignments</h2>
		<span class="text-xs text-slate-400">{pending.length + requested.length} waiting</span>
	</div>
	<p class="mt-0.5 text-xs leading-relaxed text-slate-400">
		Tasks you've been sent, and ones you sent out. Both are open.
	</p>

	<h3 class="mb-2 mt-3 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-slate-500">
		To accept ({pending.length})
	</h3>
	{#if pending.length === 0}
		<p class="py-4 text-center text-sm text-slate-500">
			Nothing waiting for you — you're all caught up.
		</p>
	{:else}
		<div class="space-y-2">
			{#each pending as task (task.id)}
				<div
					data-testid="inbox-row"
					class="rounded-xl border border-amber-200 bg-amber-50/80 px-2.5 py-2"
				>
					<div class="min-w-0">
						<p class="truncate text-sm font-medium text-slate-900">{task.title}</p>
						<p class="mt-0.5 truncate text-[0.6875rem] text-slate-500">
							From {task.creatorFirstName ?? 'someone'} · due {formatDue(task.dueDate)}
							{#if task.familyId}· <span class="font-medium text-indigo-600">Family</span>{/if}
						</p>
					</div>
					<div data-testid="inbox-respond" class="mt-1.5 flex items-center gap-1.5">
						<button
							type="button"
							onclick={() => onRespond(task, true)}
							disabled={busyId === task.id}
							class="min-h-[28px] shrink-0 rounded-full bg-emerald-600 px-3 py-1 text-[0.6875rem] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
							title="Accept"
						>
							✓ Accept
						</button>
						<button
							type="button"
							onclick={() => onRespond(task, false)}
							disabled={busyId === task.id}
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
		You asked for ({requested.length})
	</h3>
	{#if requested.length === 0}
		<p class="py-4 text-center text-sm text-slate-500">
			You haven't assigned anything out. Assign a task from the list above to see its status
			here.
		</p>
	{:else}
		<div class="space-y-2">
			{#each requested as task (task.id)}
				<div
					data-testid="inbox-row-sent"
					class="rounded-xl border border-slate-100 bg-slate-50/60 px-2.5 py-2"
				>
					<div class="flex min-w-0 items-center justify-between gap-2">
						<div class="min-w-0">
							<p class="truncate text-sm font-medium text-slate-900">{task.title}</p>
							<p class="mt-0.5 truncate text-[0.6875rem] text-slate-500">
								To {task.assignedTo ? memberName(task.assignedTo) : 'someone'}
								{#if task.familyId}· <span class="font-medium text-indigo-600">Family</span>{/if}
							</p>
						</div>
						<span
							data-testid="inbox-status"
							class="inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[0.625rem] font-bold uppercase tracking-[0.04em] {task.assignmentStatus ===
							'accepted'
								? 'bg-emerald-100 text-emerald-700'
								: task.assignmentStatus === 'declined'
									? 'bg-slate-100 text-slate-500'
									: 'bg-amber-100 text-amber-700'}"
						>
							{task.assignmentStatus === 'accepted'
								? 'Accepted'
								: task.assignmentStatus === 'declined'
									? 'Declined'
									: 'Pending'}
						</span>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</section>