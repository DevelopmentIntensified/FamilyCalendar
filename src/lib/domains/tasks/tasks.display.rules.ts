/**
 * tasks display rules — the labels a task row, the edit sheet and the
 * recurring-completion toasts print. Pure: every function takes the row and,
 * when it needs "today", the clock (R5).
 *
 * Legacy homes, reshaped into one file: `utils/taskDisplay.ts` (due label,
 * cadence noun), `utils/priorityTone.ts` (label/dot/tone) and
 * `client/taskFeedback.ts` (the two recurring toasts, whose copy is pinned by
 * the tasks page tests). The legacy modules stay for calendar/dashboard/bills
 * until their own ports; this file is the one the tasks UI reads.
 */

import { systemClock } from '$lib/kernel/time/clock';
import type { TaskPageRow } from './tasks.contract';
import { taskLateChip } from './tasks.list.rules';

/** The recurring-completion row the two toasts read (`client/taskFeedback.ts`). */
export type TaskFeedbackRow = {
	readonly id: string;
	readonly recurrenceFrequency?: string | null;
	readonly dueDate?: string | Date | null;
};

const FREQ_NOUN: Readonly<Record<string, string>> = {
	daily: 'day',
	weekly: 'week',
	monthly: 'month',
	yearly: 'year'
};

/** The cadence's unit noun ("week"), or undefined for an unknown frequency. */
export function taskFreqNoun(frequency: string | null | undefined): string | undefined {
	return frequency ? FREQ_NOUN[frequency] : undefined;
}

function instantOf(value: string | Date | null | undefined): Date | null {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * The row's due chip: "Sep 5", with the year when it is not the current one
 * (`taskDisplay.formatDue`). An unparseable date prints nothing.
 */
export function formatTaskDue(due: string | Date | null | undefined, now: Date = systemClock.now()): string {
	const date = instantOf(due);
	if (!date) return '';
	const options: Intl.DateTimeFormatOptions =
		date.getFullYear() !== now.getFullYear()
			? { month: 'short', day: 'numeric', year: 'numeric' }
			: { month: 'short', day: 'numeric' };
	return date.toLocaleDateString(undefined, options);
}

/** "Sat, Sep 5" (year added outside the current one) — the toasts' "Next:" label. */
export function taskShortDate(
	due: string | Date | null | undefined,
	now: Date = systemClock.now()
): string {
	const date = instantOf(due);
	if (!date) return '';
	const options: Intl.DateTimeFormatOptions =
		date.getFullYear() !== now.getFullYear()
			? { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }
			: { weekday: 'short', month: 'short', day: 'numeric' };
	return date.toLocaleDateString(undefined, options);
}

/**
 * The recurrence slot of the meta line: `↻ every 2 weeks · done 3×`
 * (`TaskRow.svelte:158-168`). Null for a one-off Task.
 */
export function taskRecurrenceLabel(task: TaskPageRow): string | null {
	const frequency = task.recurrenceFrequency;
	if (!frequency) return null;
	const noun = taskFreqNoun(frequency) ?? frequency;
	const every =
		task.recurrenceInterval && task.recurrenceInterval > 1
			? `every ${task.recurrenceInterval} ${noun}s`
			: `every ${noun}`;
	const done = task.completionCount ? ` · done ${task.completionCount}×` : '';
	return `↻ ${every}${done}`;
}

/** Priority words; an unknown value prints itself, as legacy did. */
export function taskPriorityLabel(priority: string): string {
	if (priority === 'high') return 'High';
	if (priority === 'normal') return 'Normal';
	if (priority === 'low') return 'Low';
	return priority;
}

/** The dot's classes: high shouts, normal neutral, low muted (`priorityTone`). */
export function taskPriorityDot(priority: string): string {
	if (priority === 'high') return 'bg-red-500';
	if (priority === 'low') return 'bg-slate-200';
	return 'bg-slate-300';
}

/**
 * A pending-assignment pill: amber while the handoff waits. A decline
 * releases the assignee (Q-053), so `declined` is a value the row never holds.
 */
export function taskAssignmentTone(status: string | null | undefined): string {
	return status === 'accepted'
		? 'bg-emerald-100 text-emerald-700'
		: 'bg-amber-100 text-amber-700';
}

/**
 * Recurring complete toast (`taskFeedback.showRecurringCompleteFeedback`):
 * names the cadence, says it counted toward the streak, and, when the cursor
 * moved, names the next occurrence.
 */
export function taskRecurringCompleteText(
	updated: TaskFeedbackRow,
	now: Date = systemClock.now()
): string {
	const noun = taskFreqNoun(updated.recurrenceFrequency) ?? 'occurrence';
	const next = taskShortDate(updated.dueDate, now);
	return `✅ Done for this ${noun} — counts toward your streak.${next ? ` Next: ${next}.` : ''}`;
}

/** Skip toast: explicitly NOT counted; a one-off skip says so plainly. */
export function taskRecurringSkipText(updated: TaskFeedbackRow, now: Date = systemClock.now()): string {
	if (!updated.recurrenceFrequency) return 'Skipped this occurrence.';
	const next = taskShortDate(updated.dueDate, now);
	return `Skipped this occurrence — not counted toward your streak.${next ? ` Next: ${next}.` : ''}`;
}

/** The focus slot: "Focusing · Nm" while a span runs, "Nm focus" once logged. */
export function taskFocusText(
	focusMinutes: number | null | undefined,
	focusStartedAt: string | Date | null | undefined,
	now: Date = systemClock.now()
): string | null {
	const logged = Math.max(0, Math.floor(focusMinutes ?? 0));
	const started = instantOf(focusStartedAt ?? null);
	if (!started) return logged > 0 ? `${logged}m focus` : null;
	const open = Math.max(0, Math.floor((now.getTime() - started.getTime()) / 60_000));
	const live = logged + open;
	return live > 0 ? `Focusing · ${live}m` : 'Focusing';
}

/** One fact on the row's single meta line; `grow` marks the slot that truncates. */
export type TaskMetaSlot = {
	readonly kind:
		| 'due'
		| 'late'
		| 'focus'
		| 'recur'
		| 'event'
		| 'note'
		| 'category'
		| 'tag'
		| 'priority'
		| 'family'
		| 'who';
	readonly text: string;
	readonly grow?: boolean;
};

/**
 * The row's ONE meta line (`TaskRow.svelte:130-185`): due, late, focus, then
 * one of recurrence / event / note in that precedence, category, tags, a
 * non-normal priority, "Family", and the word "unassigned" when nobody holds
 * it. Every fact is one slot, joined by `·`, so no row is taller than another.
 */
export function taskMetaSlots(
	task: TaskPageRow,
	focusText: string | null,
	now: Date = systemClock.now()
): TaskMetaSlot[] {
	const slots: TaskMetaSlot[] = [];
	if (task.dueDate) {
		slots.push({
			kind: 'due',
			text: formatTaskDue(task.dueDate, now),
			grow: true
		});
	}
	const late = taskLateChip(task.dueDate, now);
	if (late) slots.push({ kind: 'late', text: late });
	if (focusText) slots.push({ kind: 'focus', text: focusText });
	const recurrence = taskRecurrenceLabel(task);
	if (recurrence) {
		slots.push({ kind: 'recur', text: recurrence, grow: true });
	} else if (task.eventTitle) {
		slots.push({ kind: 'event', text: task.eventTitle, grow: true });
	} else if (task.notes) {
		slots.push({ kind: 'note', text: task.notes, grow: true });
	}
	if (task.category?.trim()) slots.push({ kind: 'category', text: task.category.trim() });
	for (const tag of task.tags ?? []) slots.push({ kind: 'tag', text: tag });
	if (task.priority && task.priority !== 'normal') {
		slots.push({ kind: 'priority', text: taskPriorityLabel(task.priority) });
	}
	if (task.familyId) slots.push({ kind: 'family', text: 'Family' });
	if (!task.assignedTo) slots.push({ kind: 'who', text: 'unassigned', grow: true });
	return slots;
}
