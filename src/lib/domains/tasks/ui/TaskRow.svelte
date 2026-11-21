<!--
	One open Task: the completion circle, the title (the edit trigger), the ONE
	meta line, and the row's actions (assignment response, focus, skip, delete).

	Everything about what the line says lives in `tasks.display.rules.ts`
	(`taskMetaSlots`), so the row only chooses a look per slot. No fetch, no
	`$app/*`: data and callbacks in, events out.

	Legacy reference: `components/tasks/TaskRow.svelte` (copy, order and the
	approved single-line meta rule).
-->
<script lang="ts">
	import ConfirmAction from '$lib/kernel/ui/ConfirmAction.svelte';
	import Pill from '$lib/kernel/ui/Pill.svelte';
	import { systemClock } from '$lib/kernel/time/clock';
	import { Ticker } from '$lib/kernel/time/ticker.svelte';
	import type { TaskPageRow } from '../tasks.contract';
	import {
		taskAssignmentTone,
		taskFocusText,
		taskMetaSlots,
		taskPriorityDot,
		type TaskMetaSlot
	} from '../tasks.display.rules';

	interface Props {
		task: TaskPageRow;
		currentUserId: string | undefined;
		/** Pre-resolved roster name for `task.assignedTo`. */
		assigneeName: string;
		busy: boolean;
		/** A start/stop focus command is in flight for this row. */
		focusBusy: boolean;
		celebrating: boolean;
		onToggle: () => void;
		onFocus: () => void;
		onEdit: () => void;
		onAccept: () => void;
		onDecline: () => void;
		onSkip: () => void;
		onDelete: () => Promise<void>;
	}

	let {
		task,
		currentUserId,
		assigneeName,
		busy,
		focusBusy,
		celebrating,
		onToggle,
		onFocus,
		onEdit,
		onAccept,
		onDecline,
		onSkip,
		onDelete
	}: Props = $props();

	// The chip counts whole minutes; the phone ticks on the same cadence.
	const ticker = new Ticker(systemClock, 30_000);
	const focusing = $derived(!!task.focusStartedAt);
	$effect(() => {
		if (focusing) ticker.start();
		else ticker.stop();
		return () => ticker.stop();
	});

	const focusText = $derived(
		taskFocusText(task.focusMinutes, task.focusStartedAt, ticker.now)
	);
	const slots = $derived(taskMetaSlots(task, focusText, ticker.now));
	const mine = $derived(task.assignedTo === currentUserId);
	const pending = $derived(task.assignmentStatus === 'pending');
	const showAssignment = $derived(
		!!task.assignedTo &&
			task.assignmentStatus !== 'none' &&
			!(task.assignedTo === task.userId && task.assignmentStatus === 'accepted')
	);
	/** Only the owner can be the command's target; assigned-out rows stay bare. */
	const canFocus = $derived(task.userId === currentUserId && !task.completedAt);
	/** The due slot turns red when the row also prints its late chip. */
	const overdue = $derived(slots.some((slot) => slot.kind === 'late'));
</script>

<div
	data-testid="task-row"
	data-focusing={focusing ? 'true' : undefined}
	class="group flex min-w-0 items-start gap-2.5 rounded-lg border px-2.5 py-2 transition-colors {slots.some(
		(slot) => slot.kind === 'late'
	)
		? 'border-red-200 bg-red-50 hover:bg-red-100'
		: 'border-slate-100 bg-slate-50/60 hover:bg-slate-100'} {focusing
		? 'ring-1 ring-emerald-300'
		: ''} {celebrating ? 'celebrate' : ''}"
>
	<button
		type="button"
		onclick={onToggle}
		disabled={busy}
		class="relative mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-slate-300 transition-colors hover:border-primary-500 active:border-primary-500"
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
		<!-- ONE meta line: nowrap + overflow-hidden is the rule; the line
		     truncates, the title truncates, no row grows for what it has to say. -->
		<p
			data-testid="task-meta"
			class="mt-[0.1875rem] flex h-5 flex-nowrap items-center gap-1 overflow-hidden whitespace-nowrap text-[0.6875rem] leading-5 text-slate-400"
		>
			{#each slots as slot, i (slot.kind + i)}
				{#if i > 0}
					<span data-slot="sep" class="shrink-0 text-slate-300" aria-hidden="true">·</span>
				{/if}
				{#if slot.kind === 'due'}
					<span data-slot="due" class="min-w-0 truncate {overdue ? 'font-bold text-red-700' : ''}">{slot.text}</span>
				{:else if slot.kind === 'late'}
					<Pill tone="danger" size="compact" testid="late-chip">{slot.text}</Pill>
				{:else if slot.kind === 'focus'}
					<span
						data-testid="focus-chip"
						data-slot="focus"
						class="inline-flex h-[1.125rem] shrink-0 items-center gap-1 rounded-full px-[0.4375rem] text-[0.625rem] font-semibold leading-none {focusing
							? 'bg-emerald-100 text-emerald-700'
							: 'bg-emerald-50 text-emerald-600'}"
						title={focusing ? 'Focusing now' : 'Focus time logged'}
					>
						{#if focusing}
							<span class="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" aria-hidden="true"
							></span>
						{/if}{slot.text}</span
					>
				{:else if slot.kind === 'recur'}
					<span data-slot="recur" class="inline-flex min-w-0 items-center gap-1 truncate font-medium text-purple-500"
						>{slot.text}</span
					>
				{:else if slot.kind === 'event'}
					<span
						data-slot="event"
						class="inline-flex min-w-0 items-center gap-1 truncate font-medium text-primary-500"
					>
						<svg class="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
							/>
						</svg>{slot.text}</span
					>
				{:else if slot.kind === 'note'}
					<span data-slot="note" class="min-w-0 truncate text-slate-500">{slot.text}</span>
				{:else if slot.kind === 'category'}
					<Pill tone="category" size="compact" truncate title="Category: {slot.text}" testid="category-chip"
						>{slot.text}</Pill
					>
				{:else if slot.kind === 'tag'}
					<Pill tone="accent" size="compact" testid="tag-chip">#{slot.text}</Pill>
				{:else if slot.kind === 'priority'}
					<span
						data-slot="priority"
						class="inline-flex shrink-0 items-center gap-1 font-medium text-slate-500"
						title="Priority: {task.priority}"
					>
						<span class="h-2 w-2 shrink-0 rounded-full {taskPriorityDot(task.priority)}" aria-hidden="true"
						></span>{slot.text}</span
					>
				{:else if slot.kind === 'family'}
					<Pill tone="family" size="compact" title="Family task" testid="family-chip">{slot.text}</Pill>
				{:else}
					<span data-slot="who" class="min-w-0 truncate">{slot.text}</span>
				{/if}
			{/each}
		</p>
	</div>
	<!-- Actions live outside the meta line: a control is not a fact about the Task. -->
	<div class="flex shrink-0 items-center gap-1">
		{#if showAssignment}
			{#if mine && pending}
				<button
					type="button"
					onclick={onAccept}
					disabled={busy}
					class="shrink-0 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-200 active:bg-emerald-200"
					title="Accept"
				>
					✓ Accept
				</button>
				<button
					type="button"
					onclick={onDecline}
					disabled={busy}
					class="shrink-0 rounded-full bg-red-100 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-200 active:bg-red-200"
					title="Decline"
				>
					✕ Decline
				</button>
			{:else}
				<span
					class="flex shrink-0 items-center gap-1 rounded-full bg-slate-100 py-0.5 pl-0.5 pr-2 text-xs font-medium text-slate-600"
					title="Assigned to {assigneeName}"
				>
					<span
						class="flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold bg-slate-200 text-slate-700"
					>
						{(task.assigneeFirstName?.[0] ?? assigneeName[0] ?? '?').toUpperCase()}
					</span>
					{assigneeName.split(' ')[0]}
					{#if pending}
						<span class="rounded-full px-1.5 text-[10px] font-semibold {taskAssignmentTone('pending')}"
							>pending</span
						>
					{/if}
				</span>
			{/if}
		{/if}
		{#if canFocus}
			<button
				type="button"
				data-testid="focus-toggle"
				onclick={onFocus}
				disabled={busy || focusBusy}
				class="pointer-fine:opacity-40 pointer-fine:group-hover:opacity-100 relative shrink-0 rounded-full p-2 transition-all focus-visible:opacity-100 active:bg-emerald-100 disabled:opacity-40 {focusing
					? 'text-emerald-600 hover:bg-emerald-100'
					: 'text-slate-300 hover:bg-emerald-100 hover:text-emerald-600'}"
				title={focusBusy ? 'Asking…' : focusing ? 'Stop focus' : 'Start focus'}
				aria-label={focusBusy ? 'Asking…' : focusing ? 'Stop focus' : 'Start focus'}
				aria-busy={focusBusy ? 'true' : undefined}
			>
				{#if focusing}
					<svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
						<rect x="6.5" y="6.5" width="11" height="11" rx="1.5" />
					</svg>
				{:else}
					<svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
						<path d="M8 5.5v13a1 1 0 0 0 1.53.85l10-6.5a1 1 0 0 0 0-1.7l-10-6.5A1 1 0 0 0 8 5.5Z" />
					</svg>
				{/if}
			</button>
		{/if}
		{#if task.recurrenceFrequency}
			<button
				type="button"
				onclick={onSkip}
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
		<ConfirmAction
			variant="icon"
			label="Delete task"
			ask="Delete?"
			confirmLabel="Yes"
			cancelLabel="No"
			pendingLabel="Deleting…"
			disabled={busy}
			testid="task-delete"
			onconfirm={onDelete}
		/>
	</div>
</div>

<style>
	@media (prefers-reduced-motion: no-preference) {
		@keyframes taskpop {
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
			animation: taskpop 0.45s ease;
		}
	}
</style>
