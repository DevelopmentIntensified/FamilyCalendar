/**
 * tasks quick-add rules — parsing's Task grammar resolved into the
 * `POST /api/tasks` body, plus the paste-a-list split and the bulk summary
 * copy. Pure: `now` is passed in (R5) and no request is made here.
 *
 * Legacy homes: `utils/taskQuickAdd.ts` (grammar — now parsing's) and
 * `client/taskSubmit.ts` (the parse → validate → body mapping), `utils/taskBulk.ts`
 * (the record split). The legacy copies stay for the event form and dashboard
 * until their ports.
 */

import { systemClock } from '$lib/kernel/time/clock';
import type { TaskQuickAddResult } from '$lib/domains/parsing';
import type { TaskCreateBody } from './tasks.contract';
import { normalizeTaskCategoryInput } from './tasks.editor.rules';

/** One record of a pasted list; `tag` is the Canvas item type, '' for plain lists. */
export type TaskRecord = { readonly text: string; readonly tag: string };

const BULLET_RE = /^[\s•\-*›]+/;
const NUMBERED_RE = /^\d+[.)\]]\s*/;
const CANVAS_TYPE = /^(assignment|quiz|discussion topic)$/i;
const CANVAS_SECTION = /^(overdue|upcoming|past)\s+assignments$/i;
const CANVAS_DUE = /^due\s+/i;
const CANVAS_SCORE = /(?:\d+\s*\/\s*)?\d+\s*pts/i;
const CANVAS_DUE_YEAR = /(due\s+[a-z]+\s+\d{1,2}(?:st|nd|rd|th)?)(?!\s*\d{4})/i;

function cleanLine(line: string): string {
	return line.replace(BULLET_RE, '').replace(NUMBERED_RE, '').trim();
}

/**
 * Split a pasted list into one record per Task. Plain lists stay one per line;
 * Canvas/LMS dumps (type, title, "Due …", score lines) join into single
 * records with the term year pinned so an overdue date never rolls forward.
 */
export function splitTaskRecords(raw: string): TaskRecord[] {
	const lines = raw
		.split(/\r?\n+/)
		.map(cleanLine)
		.filter(Boolean);
	if (!lines.some((line) => CANVAS_DUE.test(line))) {
		return lines.map((text) => ({ text, tag: '' }));
	}
	const year = systemClock.now().getFullYear();
	const out: TaskRecord[] = [];
	let title: string[] = [];
	let type = '';
	let section = '';
	const flush = (dueText: string) => {
		if (!title.length && !dueText) return;
		const pinned = dueText.replace(CANVAS_DUE_YEAR, `$1 ${year}`);
		out.push({
			text: [...title, pinned].filter(Boolean).join(' '),
			tag: [section === 'past' ? 'past' : '', type].filter(Boolean).join(' · ')
		});
		title = [];
		type = '';
	};
	for (const line of lines) {
		if (CANVAS_SECTION.test(line)) {
			section = line.split(/\s/)[0].toLowerCase();
			continue;
		}
		if (CANVAS_TYPE.test(line)) {
			type = line;
			continue;
		}
		if (CANVAS_SCORE.test(line)) continue;
		if (CANVAS_DUE.test(line)) {
			flush(line);
			continue;
		}
		title.push(line);
	}
	if (title.length) out.push({ text: title.join(' '), tag: type });
	return out;
}

/** Today at 23:59 local — the cursor a cadence needs when no date was picked. */
export function endOfDayIso(now: Date): string {
	const end = new Date(now.getTime());
	end.setHours(23, 59, 0, 0);
	return end.toISOString();
}

/**
 * The two inline refusals the grammar can raise: an unmatched `@name` is never
 * silently dropped, and `@family` without a family cannot be filed.
 */
export function taskQuickAddRefusal(
	parsed: TaskQuickAddResult,
	familyId: string | null
): string | null {
	if (parsed.unknownMember) {
		return `Unknown member ${parsed.unknownMember} — check the spelling or pick someone from your family.`;
	}
	if (parsed.familyTask && !familyId) return "@family needs a family — you're not in one yet.";
	return null;
}

export type TaskQuickAddFallbacks = {
	/** Due date when the title carries none (the picker value). */
	readonly dueDateFallback: string | null;
	readonly visibilityFallback: string;
	readonly familyId: string | null;
	readonly category: string | null;
	readonly now: Date;
};

/**
 * The create body: an explicit `#public`/`#private` in the title wins over the
 * picker, a personal Task sends `familyId: null` (POST would otherwise default
 * to the family), and a cadence with no date still gets an end-of-day cursor.
 * A blank category is omitted so it never reaches the wire.
 */
export function buildTaskQuickAddBody(
	parsed: TaskQuickAddResult,
	fallbacks: TaskQuickAddFallbacks
): TaskCreateBody {
	const dueDate =
		parsed.dueDate ??
		fallbacks.dueDateFallback ??
		(parsed.recurrenceFrequency ? endOfDayIso(fallbacks.now) : null);
	const category = normalizeTaskCategoryInput(fallbacks.category ?? '');
	const body: TaskCreateBody = {
		title: parsed.title,
		dueDate,
		priority: parsed.priority,
		assignedTo: parsed.assignedTo,
		visibility: parsed.visibilityExplicit ? parsed.visibility : fallbacks.visibilityFallback,
		familyId: parsed.familyTask ? fallbacks.familyId : null,
		tags: parsed.tags,
		recurrenceFrequency: parsed.recurrenceFrequency,
		recurrenceInterval: parsed.recurrenceInterval
	};
	if (category) body.category = category;
	return body;
}

/** Bulk outcomes: one toast names how many landed and which did not. */
export function bulkAddedMessage(added: number, total: number): string {
	return total === 1 ? 'Added 1 task.' : `Added ${added} tasks.`;
}

export function bulkFailedMessage(added: number, total: number, failed: readonly string[]): string {
	return `Added ${added} of ${total} — failed: ${failed.join(', ')}.`;
}

/** A row title clipped for the bulk failure toast (legacy 40-character cap). */
export function shortTaskTitle(title: string): string {
	return title.length > 40 ? `${title.slice(0, 40)}…` : title;
}
