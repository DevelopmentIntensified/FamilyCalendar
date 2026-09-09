import { parseTaskQuickAdd } from '$lib/utils/taskQuickAdd';

/**
 * Shared task quick-add submit (#039): the tasks page card and the event
 * modal's task tab ran duplicated copies (same parser, same guards, same
 * POST shape). Callers own UI state; this owns parse → validate → POST.
 */

interface RosterMember {
	userId: string;
	firstName: string;
	lastName: string;
}

export interface QuickAddInput {
	title: string;
	/** Due date when the title carries none (picker value or end-of-day). */
	dueDateFallback: string | null;
	visibilityFallback: string;
	familyId: string | null;
	members: RosterMember[];
}

export type QuickAddResult =
	| { ok: true; title: string; task: unknown }
	| { ok: false; error: string };

export async function submitTaskQuickAdd(input: QuickAddInput): Promise<QuickAddResult> {
	const parsed = parseTaskQuickAdd(input.title, { members: input.members });
	// Unknown/ambiguous @member: never silently dropped.
	if (parsed.unknownMember) {
		return {
			ok: false,
			error: `Unknown member ${parsed.unknownMember} — check the spelling or pick someone from your family.`
		};
	}
	if (parsed.familyTask && !input.familyId) {
		return { ok: false, error: "@family needs a family — you're not in one yet." };
	}
	// A cadence ("every 2 weeks") with no picked date still needs a cursor.
	const dueDate =
		parsed.dueDate ?? input.dueDateFallback ?? (parsed.recurrenceFrequency ? endOfDayIso() : null);
	try {
		const res = await fetch('/api/tasks', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				title: parsed.title,
				dueDate,
				priority: parsed.priority,
				assignedTo: parsed.assignedTo,
				// An explicit #public/#private tag in the title wins over the picker.
				visibility: parsed.visibilityExplicit ? parsed.visibility : input.visibilityFallback,
				// POST defaults an absent familyId to the user's family, so a
				// personal task must send null explicitly (issue 019).
				familyId: parsed.familyTask ? input.familyId : null,
				tags: parsed.tags,
				recurrenceFrequency: parsed.recurrenceFrequency,
				recurrenceInterval: parsed.recurrenceInterval
			})
		});
		if (!res.ok) {
			const j = await res.json().catch(() => ({}));
			return { ok: false, error: j.error || "That didn't work. Try again." };
		}
		const json = await res.json();
		return { ok: true, title: parsed.title, task: json.task };
	} catch {
		return { ok: false, error: "That didn't work. Try again." };
	}
}

function endOfDayIso(): string {
	const d = new Date();
	d.setHours(23, 59, 0, 0);
	return d.toISOString();
}
