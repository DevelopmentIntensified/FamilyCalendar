<script lang="ts">
	import { formatDue, freqNoun } from '$lib/utils/taskDisplay';

	/** Structural row shape — the family tasks page passes its local TaskItem. */
	export interface FamilyTask {
		id: string;
		title: string;
		notes: string | null;
		tags?: string[];
		dueDate: string | null;
		completedAt?: string | null;
		recurrenceFrequency?: string | null;
		recurrenceInterval?: number | null;
		completionCount?: number | null;
		eventTitle?: string | null;
		assignedTo?: string | null;
		assignmentStatus?: string | null;
		priority?: string | null;
		familyId?: string | null;
		creatorFirstName?: string | null;
		userId: string;
	}

	interface Props {
		task: FamilyTask;
		variant: 'open' | 'completed' | 'public';
		currentUserId: string | undefined;
		/** Permission gate for the toggle (family rule: assignee-or-creator). */
		canComplete: boolean;
		completeTitle: string;
		/** Pre-resolved display name of task.assignedTo. */
		assigneeName: string;
		overdue: boolean;
		busy: boolean;
		/** Family dot palette default (differs from shared: sky low). */
		priorityDot?: (priority: string) => string;
		onToggle: () => void;
		onAccept: () => void;
		onDecline: () => void;
		onAdvance: () => void;
		onDelete: () => void;
	}

	let {
		task,
		variant,
		currentUserId,
		canComplete,
		completeTitle,
		assigneeName,
		overdue,
		busy,
		priorityDot = (p: string) =>
			p === 'high' ? 'bg-red-500' : p === 'low' ? 'bg-sky-500' : 'bg-slate-300',
		onToggle,
		onAccept,
		onDecline,
		onAdvance,
		onDelete
	}: Props = $props();

	let minePending = $derived(
		task.assignedTo && task.assignmentStatus === 'pending' && task.assignedTo === currentUserId
	);
	let otherPending = $derived(
		task.assignedTo && task.assignmentStatus === 'pending' && task.assignedTo !== currentUserId
	);
	let ownTask = $derived(task.userId === currentUserId);

	function recurrenceNote(): string {
		if (!task.recurrenceFrequency) return '';
		const noun = freqNoun(task.recurrenceFrequency) ?? task.recurrenceFrequency;
		return task.recurrenceInterval && task.recurrenceInterval > 1
			? `every ${task.recurrenceInterval} ${noun}s`
			: `every ${noun}`;
	}
</script>

{#if variant === 'public'}
	<div class="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
		<div class="min-w-0 flex-1">
			<p class="truncate text-sm font-medium text-slate-900">{task.title}</p>
			<div class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
				{#if task.dueDate}
					<span class={overdue ? 'font-semibold text-red-600' : ''}>{formatDue(task.dueDate)}</span>
				{/if}
				<span>by {task.creatorFirstName ?? 'a family member'}</span>
			</div>
			{#if task.tags?.length}
				<div class="mt-1 flex flex-wrap items-center gap-1">
					{#each task.tags as tag (tag)}
						<span class="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700"
							>#{tag}</span
						>
					{/each}
				</div>
			{/if}
		</div>
		<span
			class="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500"
			title="Public task — read-only for other members"
		>
			🌐 Public
		</span>
	</div>
{:else if variant === 'completed'}
	<div
		class="group flex min-w-0 flex-wrap items-center gap-2.5 overflow-hidden rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-2 transition-colors hover:bg-slate-100"
	>
		<button
			type="button"
			onclick={onToggle}
			disabled={busy || !canComplete}
			class="relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-500 text-white active:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-40"
			aria-label="Mark incomplete"
		>
			<span class="absolute -inset-2" aria-hidden="true"></span>
			<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
				<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
			</svg>
		</button>
		<div class="min-w-0 flex-1">
			<p class="truncate text-sm text-slate-400 line-through">{task.title}</p>
			{#if task.tags?.length}
				<div class="mt-1 flex flex-wrap items-center gap-1">
					{#each task.tags as tag (tag)}
						<span
							class="rounded-full bg-sky-100/60 px-1.5 py-0.5 text-[10px] font-medium text-sky-600"
							>#{tag}</span
						>
					{/each}
				</div>
			{/if}
		</div>
		<span class="shrink-0 text-xs text-slate-400">{assigneeName}</span>
		{#if ownTask}
			<button
				type="button"
				onclick={onDelete}
				disabled={busy}
				class="pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 relative shrink-0 rounded-full p-2 text-slate-300 transition-all hover:bg-red-50 hover:text-red-500"
				aria-label="Delete task"
			>
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
					/>
				</svg>
			</button>
		{/if}
	</div>
{:else}
	<div
		class="group flex flex-wrap items-center gap-3 overflow-hidden rounded-xl border border-slate-200 bg-white p-3 transition-all hover:border-slate-300 active:bg-slate-100"
	>
		<button
			type="button"
			onclick={() => canComplete && onToggle()}
			disabled={busy || !canComplete}
			title={completeTitle}
			class="relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-slate-300 transition-colors active:border-primary-500 enabled:hover:border-primary-500 disabled:cursor-not-allowed disabled:opacity-40"
			aria-label="Complete task"
		>
			<span class="absolute -inset-2" aria-hidden="true"></span>
		</button>
		<div class="min-w-0 flex-1">
			<p class="truncate text-sm font-medium text-slate-900">{task.title}</p>
			{#if task.recurrenceFrequency}
				<p class="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-purple-500">
					<svg
						class="h-3 w-3 shrink-0"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M4 4v5h5M20 20v-5h-5M4 9a8 8 0 0114-3m2 9a8 8 0 01-14 3"
						/>
					</svg>
					{recurrenceNote()}
					{#if task.completionCount}
						<span
							class="ml-0.5 inline-flex items-center gap-0.5 rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-600"
						>
							🔥 {task.completionCount}×
						</span>
					{/if}
				</p>
			{:else if task.eventTitle}
				<p class="truncate text-xs font-medium text-primary-500">{task.eventTitle}</p>
			{:else if task.notes}
				<p class="truncate text-xs text-slate-500">{task.notes}</p>
			{/if}
			{#if task.tags?.length}
				<div class="mt-1 flex flex-wrap items-center gap-1">
					{#each task.tags as tag (tag)}
						<span class="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700"
							>#{tag}</span
						>
					{/each}
				</div>
			{/if}
		</div>
		{#if minePending}
			<span class="flex shrink-0 items-center gap-1">
				<button
					type="button"
					onclick={onAccept}
					disabled={busy}
					class="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-200 active:bg-emerald-200"
					title="Accept"
				>
					✓ Accept
				</button>
				<button
					type="button"
					onclick={onDecline}
					disabled={busy}
					class="rounded-full bg-red-100 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-200 active:bg-red-200"
					title="Decline"
				>
					✕
				</button>
			</span>
		{:else if otherPending}
			<span
				class="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700"
			>
				waiting for {assigneeName}
			</span>
		{/if}
		{#if task.dueDate}
			<span
				class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium {overdue
					? 'bg-red-100 text-red-700'
					: 'bg-slate-100 text-slate-600'}"
			>
				{formatDue(task.dueDate)}
			</span>
		{/if}
		{#if task.priority && task.priority !== 'normal'}
			<span
				class="h-2 w-2 shrink-0 rounded-full {priorityDot(task.priority)}"
				title="Priority: {task.priority}"
			></span>
		{/if}
		{#if ownTask}
			{#if task.recurrenceFrequency && !task.completedAt}
				<button
					type="button"
					onclick={onAdvance}
					disabled={busy}
					class="pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 relative shrink-0 rounded-full p-2 text-slate-300 transition-all hover:bg-purple-100 hover:text-purple-500"
					title="Skip this occurrence (rolls to next)"
					aria-label="Skip to next occurrence"
				>
					<svg
						class="h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
					</svg>
				</button>
			{/if}
			<button
				type="button"
				onclick={onDelete}
				disabled={busy}
				class="pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 relative shrink-0 rounded-full p-2 text-slate-300 transition-all hover:bg-red-50 hover:text-red-500"
				aria-label="Delete task"
			>
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1 1v3M4 7h16"
					/>
				</svg>
			</button>
		{/if}
	</div>
{/if}
