<script lang="ts">
	import { avatarColor } from '$lib/utils/avatarColor';
	import { priorityDot, priorityLabel } from '$lib/utils/priorityTone';
	import { lateChip } from '$lib/utils/taskUrgency';
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
	/** The flat list has no Overdue heading, so the row says how late it is. */
	let late = $derived(lateChip(task.dueDate));
	let showAssignment = $derived(
		task.assignedTo &&
			task.assignmentStatus !== 'none' &&
			!(task.assignedTo === task.userId && task.assignmentStatus === 'accepted')
	);

	/* ── THE ONE META LINE ────────────────────────────────────────────────
	 * tasks.html and b-tasks-flat.html, both approved, say the same sentence
	 * about the row: "ONE baseline, ONE separator, ONE height. The old meta
	 * line wrapped to two and three lines depending on the title, which is
	 * what made the rows look ununiform. It never wraps now: the row
	 * truncates, the title does."
	 *
	 * #101 shipped the flat LIST and nothing else; this row had drifted so far
	 * from it that the date, the recurrence, the event, the note, the tags and
	 * the assignee each owned a line of their own, so a row with four tags was
	 * 40px taller than a bare one. Every fact below is therefore ONE slot in
	 * ONE `flex-nowrap` element of ONE height, joined by the prototype's `·`.
	 */
	interface MetaSlot {
		kind: 'due' | 'late' | 'recur' | 'event' | 'note' | 'tag' | 'priority' | 'family' | 'who';
		text: string;
		/** Only the date grows and truncates; everything else is `flex: none`. */
		grow?: boolean;
		store?: string;
	}
	let slots = $derived.by((): MetaSlot[] => {
		const out: MetaSlot[] = [];
		if (task.dueDate) out.push({ kind: 'due', text: formatDue(task.dueDate), grow: true });
		if (late) out.push({ kind: 'late', text: late });
		// One of recurrence / event / note, in that order — the same precedence
		// the three separate lines had. Two of them would be a second line.
		if (task.recurrenceFrequency) {
			out.push({
				kind: 'recur',
				text: `↻ ${task.recurrenceInterval && task.recurrenceInterval > 1 ? `every ${task.recurrenceInterval} ${freqNoun(task.recurrenceFrequency) ?? task.recurrenceFrequency}s` : `every ${freqNoun(task.recurrenceFrequency) ?? task.recurrenceFrequency}`}${task.completionCount ? ` · done ${task.completionCount}×` : ''}`,
				grow: true
			});
		} else if (task.eventTitle) {
			out.push({ kind: 'event', text: task.eventTitle, grow: true });
		} else if (task.notes) {
			out.push({ kind: 'note', text: task.notes, grow: true });
		}
		for (const tag of task.tags ?? []) out.push({ kind: 'tag', text: tag });
		// Only a priority that is not normal, and the dot travels WITH the label
		// as one slot so the dot cannot read as a stray separator.
		if (task.priority && task.priority !== 'normal') {
			out.push({ kind: 'priority', text: priorityLabel(task.priority) });
		}
		if (task.familyId) out.push({ kind: 'family', text: 'Family' });
		if (!task.assignedTo) {
			// The prototype's last slot, in words: an avatar when there is a
			// person, the WORD "unassigned" when there is not.
			out.push({ kind: 'who', text: 'unassigned', grow: true });
		}
		return out;
	});
</script>

<div
	data-testid="task-row"
	class="group flex min-w-0 items-start gap-2.5 rounded-lg border px-2.5 py-2 transition-colors {late
		? 'border-red-200 bg-red-50 hover:bg-red-100'
		: 'border-slate-100 bg-slate-50/60 hover:bg-slate-100'} {celebrating ? 'celebrate' : ''}"
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
		<!-- THE ONE META LINE. `flex-nowrap` + `overflow-hidden` +
		     `whitespace-nowrap` + `h-5` IS the rule from tasks.html: the LINE
		     truncates, the title does, and no row is taller than another because
		     of what it has to say. Every fact is one slot, joined by `·`. -->
		<p
			data-testid="task-meta"
			class="mt-[0.1875rem] flex h-5 flex-nowrap items-center gap-1 overflow-hidden whitespace-nowrap text-[0.6875rem] leading-5 text-slate-400"
		>
			{#each slots as slot, i (slot.kind + i)}
				{#if i > 0}
					<span data-slot="sep" class="shrink-0 text-slate-300" aria-hidden="true">·</span>
				{/if}
				{#if slot.kind === 'due'}
					<span
						data-slot="due"
						class="min-w-0 truncate {late ? 'font-bold text-red-700' : ''}">{slot.text}</span
					>
				{:else if slot.kind === 'late'}
					<span
						data-slot="late"
						class="inline-flex h-[1.125rem] shrink-0 items-center rounded-full bg-red-100 px-[0.4375rem] text-[0.625rem] font-bold leading-none text-red-700"
						title="Overdue">{slot.text}</span
					>
				{:else if slot.kind === 'recur'}
					<span
						data-slot="recur"
						class="inline-flex min-w-0 items-center gap-1 truncate font-medium text-purple-500"
						>{slot.text}</span
					>
				{:else if slot.kind === 'event'}
					<span
						data-slot="event"
						class="inline-flex min-w-0 items-center gap-1 truncate font-medium text-primary-500"
					>
						<svg
							class="h-3 w-3 shrink-0"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							aria-hidden="true"
						>
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
				{:else if slot.kind === 'tag'}
					<span
						data-slot="tag"
						class="inline-flex h-[1.125rem] shrink-0 items-center rounded-full bg-sky-100 px-[0.4375rem] text-[0.625rem] font-medium leading-none text-sky-700"
						>#{slot.text}</span
					>
				{:else if slot.kind === 'priority'}
					<span
						data-slot="priority"
						class="inline-flex shrink-0 items-center gap-1 font-medium text-slate-500"
						title="Priority: {task.priority}"
					>
						<span
							class="h-2 w-2 shrink-0 rounded-full {priorityDot(task.priority ?? 'normal')}"
							aria-hidden="true"></span>{slot.text}</span
					>
				{:else if slot.kind === 'family'}
					<span
						data-slot="family"
						class="inline-flex h-[1.125rem] shrink-0 items-center rounded-full bg-indigo-100 px-[0.4375rem] text-[0.625rem] font-medium leading-none text-indigo-700"
						title="Family task">{slot.text}</span
					>
				{:else}
					<!-- The prototype's last slot, in words. Printed ONLY when there
					     is no person: with an assignee the right-hand chip already
					     names them, and two avatars on one row would say the same
					     thing twice. Printing nothing at all made a gap in the queue
					     look like a forgotten row. -->
					<span data-slot="who" class="min-w-0 truncate">{slot.text}</span>
				{/if}
			{/each}
		</p>
	</div>
	<!-- The row's actions live OUTSIDE the meta line: a control is not a fact
	     about the task, and the prototype's row has one button on the right. -->
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
				<!-- tasks.html, approved: "Accept and Decline as two labelled
				     buttons rather than a labelled Accept beside a bare ✕." The
				     bare ✕ read as "dismiss this row". -->
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
</div>
