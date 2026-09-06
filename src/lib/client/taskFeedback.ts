import { invalidateAll } from '$app/navigation';
import { pushToast } from './toasts';

export type RecurrenceFrequencyNoun = 'daily' | 'weekly' | 'monthly' | 'yearly';

const FREQ_NOUN: Record<RecurrenceFrequencyNoun, string> = {
	daily: 'day',
	weekly: 'week',
	monthly: 'month',
	yearly: 'year'
};

function isRecurrenceFrequencyNoun(freq: string): freq is RecurrenceFrequencyNoun {
	return freq === 'daily' || freq === 'weekly' || freq === 'monthly' || freq === 'yearly';
}

function freqNoun(freq: string | null | undefined): string {
	if (!freq) return 'occurrence';
	return isRecurrenceFrequencyNoun(freq) ? FREQ_NOUN[freq] : freq;
}

/** Short date label for "Next:". "Sat, Sep 5" style; year added when not the current year. */
function shortDate(due: string | Date | null | undefined): string {
	if (!due) return '';
	const d = due instanceof Date ? due : new Date(due);
	if (isNaN(d.getTime())) return '';
	const opts: Intl.DateTimeFormatOptions =
		d.getFullYear() !== new Date().getFullYear()
			? { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }
			: { weekday: 'short', month: 'short', day: 'numeric' };
	return d.toLocaleDateString(undefined, opts);
}

/** Minimal task row shape needed for recurring-complete/skip feedback toasts. */
export interface RecurringTaskFeedbackRow {
	id: string;
	recurrenceFrequency?: string | null;
	dueDate?: string | Date | null;
}
/**
 * A1 + C1 + D2: after a recurring task is checked off (the cursor advanced
 * to the next occurrence), show a toast that says it counted toward the
 * streak, names the next occurrence, and offers Undo.
 *
 * Surfaces keep their own fetch/busy/offline logic and call this on their
 * success path with the updated task row.
 */
export function showRecurringCompleteFeedback(
	updated: RecurringTaskFeedbackRow,
	previousDueDate: string | Date | null
): void {
	if (updated?.recurrenceFrequency) {
		const noun = freqNoun(updated.recurrenceFrequency);
		const next = shortDate(updated.dueDate);
		pushToast({
			message: `✅ Done for this ${noun} — counts toward your streak.${next ? ` Next: ${next}.` : ''}`,
			actionLabel: 'Undo',
			onAction: () => undoTaskWithFeedback(updated.id, previousDueDate)
		});
	}
}

/** C1: skipping an occurrence is explicitly framed as NOT counting. */
export function showRecurringSkipFeedback(updated: RecurringTaskFeedbackRow): void {
	if (updated?.recurrenceFrequency) {
		const next = shortDate(updated.dueDate);
		pushToast({
			message: `Skipped this occurrence — not counted toward your streak.${next ? ` Next: ${next}.` : ''}`
		});
	} else {
		pushToast({ message: 'Skipped this occurrence.' });
	}
}

/** Undo a completed recurring task: restores the date, tally, and streak history. */
export async function undoTaskWithFeedback(
	taskId: string,
	previousDueDate: string | Date | null
): Promise<boolean> {
	const res = await fetch(`/api/tasks/${taskId}`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ undoComplete: true, previousDueDate: previousDueDate ?? null })
	});
	if (!res.ok) return false;
	await invalidateAll();
	pushToast({ message: '↩️ Undone — back to the previous occurrence.' });
	return true;
}
