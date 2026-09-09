<script lang="ts">
	import { formatDue } from '$lib/utils/taskDisplay';
	import { isOverdue } from '$lib/utils/priorityTone';
	import { nameOf } from '$lib/utils/familyTaskActions';

	export interface OpenTask {
		id: string;
		title: string;
		dueDate?: string | null;
		recurrenceFrequency?: string | null;
		completionCount?: number | null;
		assignedTo?: string | null;
		assignmentStatus?: string | null;
		assigneeFirstName?: string | null;
		assigneeLastName?: string | null;
		userId: string;
		creatorFirstName?: string | null;
		tags?: string[];
	}

	interface Props {
		task: OpenTask;
		currentUserId: string | undefined;
		busy: boolean;
		confirmDelete: boolean;
		onToggle: () => void;
		onAccept: () => void;
		onDecline: () => void;
		onAdvance: () => void;
		onBeginDelete: () => void;
		onCancelDelete: () => void;
		onDelete: () => void;
	}

	let {
		task,
		currentUserId,
		busy,
		confirmDelete,
		onToggle,
		onAccept,
		onDecline,
		onAdvance,
		onBeginDelete,
		onCancelDelete,
		onDelete
	}: Props = $props();

	function overdue(): boolean {
		if (!task.dueDate) return false;
		return isOverdue(task.dueDate);
	}

	let assigneeFirst = $derived(
		nameOf(task.assigneeFirstName, task.assigneeLastName, task.assignedTo ?? '?').split(' ')[0]
	);
	let minePending = $derived(
		task.assignedTo && task.assignmentStatus === 'pending' && task.assignedTo === currentUserId
	);
	let ownTask = $derived(task.userId === currentUserId);
</script>

<div
	class="group flex flex-wrap items-center gap-3 overflow-hidden rounded-xl border border-slate-200 bg-white p-3 transition-all hover:border-slate-300 active:bg-slate-100"
>
	<button
		type="button"
		onclick={onToggle}
		disabled={busy}
		class="relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-slate-300 transition-colors hover:border-primary-500 active:border-primary-500"
		aria-label="Complete task"
	>
		<span class="absolute -inset-2" aria-hidden="true"></span>
	</button>

	<div class="min-w-0 flex-1">
		<p class="truncate text-sm font-medium text-slate-900">{task.title}</p>
		<div class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
			{#if task.dueDate}
				<span class={overdue() ? 'font-semibold text-red-600' : ''}>{formatDue(task.dueDate)}</span>
			{/if}
			{#if task.recurrenceFrequency}
				<span class="text-purple-500">🔁 recurring</span>
				{#if task.completionCount}
					<span
						class="inline-flex items-center gap-0.5 rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-600"
					>
						🔥 {task.completionCount}×
					</span>
				{/if}
			{/if}
			<span>by {nameOf(task.creatorFirstName, null, 'family')}</span>
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

	{#if task.assignedTo}
		{#if minePending}
			<span class="flex shrink-0 items-center gap-1">
				<button
					type="button"
					onclick={onAccept}
					disabled={busy}
					class="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-200 active:bg-emerald-200"
				>
					✓ Accept
				</button>
				<button
					type="button"
					onclick={onDecline}
					disabled={busy}
					class="rounded-full bg-red-100 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-200 active:bg-red-200"
				>
					✕
				</button>
			</span>
		{:else}
			<span
				class="flex shrink-0 items-center gap-1 rounded-full bg-slate-100 py-0.5 pl-0.5 pr-2 text-xs font-medium text-slate-600"
			>
				<span
					class="flex h-4 w-4 items-center justify-center rounded-full bg-primary-600 text-[9px] font-bold text-white"
				>
					{(task.assigneeFirstName?.[0] ?? '?').toUpperCase()}
				</span>
				{assigneeFirst}
				{#if task.assignmentStatus === 'pending'}
					<span class="rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-700"
						>pending</span
					>
				{/if}
			</span>
		{/if}
	{/if}

	{#if ownTask}
		{#if task.recurrenceFrequency}
			<button
				type="button"
				onclick={onAdvance}
				disabled={busy}
				class="pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 relative shrink-0 rounded-full p-2 text-slate-300 transition-all hover:bg-purple-100 hover:text-purple-500"
				title="Skip this occurrence (rolls to next)"
				aria-label="Skip to next occurrence"
			>
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
				</svg>
			</button>
		{/if}
		{#if confirmDelete}
			<div class="flex shrink-0 items-center gap-1.5">
				<span class="text-xs font-medium text-red-600">Delete "{task.title}"?</span>
				<button
					type="button"
					onclick={onDelete}
					disabled={busy}
					class="rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
				>
					{busy ? 'Deleting…' : 'Yes'}
				</button>
				<button
					type="button"
					onclick={onCancelDelete}
					disabled={busy}
					class="rounded-full bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-300"
				>
					No
				</button>
			</div>
		{:else}
			<button
				type="button"
				onclick={onBeginDelete}
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
	{/if}
</div>
