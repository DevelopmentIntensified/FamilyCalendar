<script lang="ts">
	import { avatarColor } from '$lib/utils/avatarColor';
	import { dueTone, priorityDot, priorityLabel } from '$lib/utils/priorityTone';
	import { formatDue, freqNoun } from '$lib/utils/taskDisplay';

	/** Structural task shape — both task pages pass their local TaskItem. */
	export interface TaskRowTask {
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
		familyId?: string | null;
		assigneeFirstName?: string | null;
		userId: string;
		eventTitle?: string | null;
		tags?: string[];
	}

	interface Props {
		task: TaskRowTask;
		currentUserId: string | undefined;
		/** Pre-resolved display name for task.assignedTo (parent owns roster). */
		assigneeName: string;
		busy: boolean;
		celebrating: boolean;
		confirmDelete: boolean;
		onToggle: () => void;
		onEdit: () => void;
		onAccept: () => void;
		onDecline: () => void;
		onAdvance: () => void;
		onDelete: () => void;
		onAskDelete: () => void;
		onCancelDelete: () => void;
	}

	let {
		task,
		currentUserId,
		assigneeName,
		busy,
		celebrating,
		confirmDelete,
		onToggle,
		onEdit,
		onAccept,
		onDecline,
		onAdvance,
		onDelete,
		onAskDelete,
		onCancelDelete
	}: Props = $props();

	let mine = $derived(task.assignedTo === currentUserId);
	let pending = $derived(task.assignmentStatus === 'pending');
	let showAssignment = $derived(
		task.assignedTo &&
			task.assignmentStatus !== 'none' &&
			!(task.assignedTo === task.userId && task.assignmentStatus === 'accepted')
	);
</script>

<div
	class="group flex min-w-0 flex-wrap items-center gap-2.5 overflow-hidden rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-2 transition-colors hover:bg-slate-100 {celebrating
		? 'celebrate'
		: ''}"
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
		<button
			type="button"
			onclick={onEdit}
			class="block w-full truncate text-left text-sm font-medium text-slate-900 hover:text-primary-600"
			title="Edit task"
		>
			{task.title}
		</button>
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
				{task.recurrenceInterval && task.recurrenceInterval > 1
					? `every ${task.recurrenceInterval} ${freqNoun(task.recurrenceFrequency) ?? task.recurrenceFrequency}s`
					: `every ${freqNoun(task.recurrenceFrequency) ?? task.recurrenceFrequency}`}
				{#if task.completionCount}
					<span
						class="ml-0.5 inline-flex items-center gap-0.5 rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-600"
					>
						🔥 {task.completionCount}×
					</span>
				{/if}
			</p>
		{:else if task.eventTitle}
			<p class="mt-0.5 flex items-center gap-1 truncate text-xs font-medium text-primary-500">
				<svg class="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
					/>
				</svg>
				{task.eventTitle}
			</p>
		{:else if task.notes}
			<p class="truncate text-xs text-slate-500">{task.notes}</p>
		{/if}
		{#if task.familyId}
			<span
				class="mr-1 mt-1 inline-flex items-center rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700"
				title="Family task"
			>
				Family
			</span>
		{/if}
		{#if (task.tags ?? []).length > 0}
			<div class="mt-1 flex flex-wrap gap-1">
				{#each task.tags ?? [] as tag (tag)}
					<span class="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700"
						>#{tag}</span
					>
				{/each}
			</div>
		{/if}
	</div>
	{#if task.dueDate}
		<span class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium {dueTone(task.dueDate)}">
			{formatDue(task.dueDate)}
		</span>
	{/if}
	{#if task.priority && task.priority !== 'normal'}
		<span class="flex shrink-0 items-center gap-1" title="Priority: {task.priority}">
			<span class="h-2 w-2 rounded-full {priorityDot(task.priority)}" aria-hidden="true"></span>
			<span class="text-[11px] font-medium text-slate-500">{priorityLabel(task.priority)}</span>
		</span>
	{/if}
	{#if showAssignment}
		{#if mine && pending}
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
		{:else}
			<span
				class="flex shrink-0 items-center gap-1 rounded-full bg-slate-100 py-0.5 pl-0.5 pr-2 text-xs font-medium text-slate-600"
				title="Assigned to {assigneeName}"
			>
				<span
					class="flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold {avatarColor(
						task.assignedTo ?? ''
					)}"
				>
					{(task.assigneeFirstName?.[0] ?? assigneeName[0] ?? '?').toUpperCase()}
				</span>
				{assigneeName.split(' ')[0]}
				{#if task.assignmentStatus === 'pending'}
					<span class="rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-700"
						>pending</span
					>
				{/if}
			</span>
		{/if}
	{/if}
	{#if task.recurrenceFrequency && !task.completedAt}
		<button
			type="button"
			onclick={onAdvance}
			disabled={busy}
			class="pointer-fine:opacity-40 pointer-fine:group-hover:opacity-100 relative shrink-0 rounded-full p-2 text-slate-300 transition-all hover:bg-purple-100 hover:text-purple-500 focus-visible:opacity-100 active:bg-purple-100"
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
			<span class="text-xs font-medium text-red-600">Delete?</span>
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
			onclick={onAskDelete}
			disabled={busy}
			class="pointer-fine:opacity-40 pointer-fine:group-hover:opacity-100 relative shrink-0 rounded-full p-2 text-slate-300 transition-all hover:bg-red-50 hover:text-red-500 focus-visible:opacity-100 active:bg-red-50"
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
