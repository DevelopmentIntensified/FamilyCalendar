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

	type AssignTab = 'accept' | 'requested';
	let assignTab: AssignTab = $state('accept');
</script>

<section class="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
	<h2 class="text-sm font-semibold text-slate-900">Assignments</h2>
	<p class="mt-0.5 text-xs text-slate-400">Tasks you've been sent, and ones you sent out</p>
	<div class="mb-3 mt-3 flex gap-1.5" role="tablist" aria-label="Assignment lists">
		<button
			type="button"
			role="tab"
			aria-selected={assignTab === 'accept'}
			onclick={() => (assignTab = 'accept')}
			class="min-h-[44px] flex-1 rounded-full border px-3.5 text-sm font-medium transition-colors {assignTab ===
			'accept'
				? 'border-slate-900 bg-slate-900 text-white'
				: 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'}"
		>
			To accept ({pending.length})
		</button>
		<button
			type="button"
			role="tab"
			aria-selected={assignTab === 'requested'}
			onclick={() => (assignTab = 'requested')}
			class="min-h-[44px] flex-1 rounded-full border px-3.5 text-sm font-medium transition-colors {assignTab ===
			'requested'
				? 'border-slate-900 bg-slate-900 text-white'
				: 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'}"
		>
			Requested ({requested.length})
		</button>
	</div>

	{#if assignTab === 'accept'}
		{#if pending.length === 0}
			<p class="py-6 text-center text-sm text-slate-500">
				Nothing waiting for you — you're all caught up.
			</p>
		{:else}
			<div class="space-y-1.5">
				{#each pending as task (task.id)}
					<div
						class="flex min-w-0 flex-wrap items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50/80 px-2.5 py-2"
					>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium text-slate-900">{task.title}</p>
							<p class="mt-0.5 text-xs text-slate-500">
								From
								{task.creatorFirstName ?? 'someone'}
								{#if task.dueDate}· due {formatDue(task.dueDate)}{/if}
								{#if task.familyId}· <span class="font-medium text-indigo-600">Family</span>{/if}
							</p>
						</div>
						<span class="flex shrink-0 items-center gap-1.5">
							<button
								type="button"
								onclick={() => onRespond(task, true)}
								disabled={busyId === task.id}
								class="min-h-[44px] rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
								title="Accept"
							>
								✓ Accept
							</button>
							<button
								type="button"
								onclick={() => onRespond(task, false)}
								disabled={busyId === task.id}
								class="min-h-[44px] rounded-full bg-red-100 px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-200 disabled:opacity-50"
								title="Decline"
							>
								✕ Decline
							</button>
						</span>
					</div>
				{/each}
			</div>
		{/if}
	{:else if requested.length === 0}
		<p class="py-6 text-center text-sm text-slate-500">
			You haven't assigned anything out. Assign a task from the list above to see its status here.
		</p>
	{:else}
		<div class="space-y-1.5">
			{#each requested as task (task.id)}
				<div
					class="flex min-w-0 flex-wrap items-center gap-2.5 rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-2 transition-colors hover:bg-slate-100"
				>
					<div class="min-w-0 flex-1">
						<p class="truncate text-sm font-medium text-slate-900">{task.title}</p>
						<p class="mt-0.5 text-xs text-slate-500">
							To {task.assignedTo ? memberName(task.assignedTo) : 'someone'}
							{#if task.familyId}· <span class="font-medium text-indigo-600">Family</span>{/if}
						</p>
					</div>
					<span
						class="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold {task.assignmentStatus ===
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
			{/each}
		</div>
	{/if}
</section>
