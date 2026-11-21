/**
 * tasks quick-add service: the grammar lives in `parsing`
 * (`parseTaskQuickAdd`), this file turns one typed line into the
 * `POST /api/tasks` body, resolving the roster and the caller's zone.
 *
 * It is the server half of the legacy `client/taskSubmit.ts` + `utils/
 * taskQuickAdd.ts` pair (#039: the tasks card and the event modal ran
 * duplicated copies). Nothing here writes a Task: the answer is the
 * contract-parsed create body, so every caller (page, Android, the event
 * checklist) creates through the one `createTask` use-case and inherits its
 * authorization, category auto-add and Alerts.
 *
 * Refusals use the legacy inline copy, verbatim: an unknown/ambiguous
 * `@member` is never silently dropped, and `@family` without a family errors.
 * A cadence with no date still gets a cursor (end of day in the caller's zone).
 *
 * Doc: ./README.md#invariants
 */
import { DateTime } from 'luxon';
import type { Actor } from '$lib/kernel/ctx/actor';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import { invalid } from '$lib/kernel/errors/appError';
import { listFamilyRoster } from '$lib/domains/family/index.server';
import { getTimeZone } from '$lib/domains/identity/index.server';
import { parseTaskQuickAdd } from '$lib/domains/parsing/index';
import { TASK_INVALID_DUEDATE, TaskCreateBody } from './tasks.contract';
import { normalizeTaskVisibility } from './tasks.task.rules';

/** What the add form hands over: the typed line and its picker fallbacks. */
export type TaskQuickAddInput = {
	/** The raw text: title plus any grammar (`@member`, `#tags`, "every 2 weeks"). */
	readonly text: string;
	/** The picked due date when the text carries none; `null`/absent = none. */
	readonly dueDateFallback?: string | null;
	/** The visibility picker's value; an explicit `#public`/`#private` in the text wins. */
	readonly visibilityFallback?: string | null;
	/** The category picker's value; blank/absent is not sent (POST's absent rule). */
	readonly category?: string | null;
};

/** One resolvable quick-add: the parsed title and the create body it feeds. */
export type TaskQuickAddDraft = {
	/** The title with every recognized phrase stripped (the preview's title too). */
	readonly title: string;
	/** `POST /api/tasks`'s body, already through the contract's transforms. */
	readonly body: TaskCreateBody;
};

/** 23:59:00 in the caller's zone — the legacy cadence-without-a-date cursor. */
function endOfDayIso(zone: string, now: Date): string {
	return (
		DateTime.fromJSDate(now, { zone })
			.startOf('day')
			.plus({ hours: 23, minutes: 59 })
			.toUTC()
			.toISO() ?? ''
	);
}

/**
 * Resolve one quick-add line into a create body. Reads the caller's family
 * roster (assignee phrases are roster-scoped) and stored zone (due dates land
 * at 23:59 there), then runs parsing's grammar — never a second copy of it.
 *
 * `400 Unknown member @x — …` for an ambiguous/unknown `@handle`;
 * `400 @family needs a family — you're not in one yet.` for `@family` without
 * a family; `400 Invalid dueDate` when the picker's fallback is not a date.
 */
export async function resolveTaskQuickAdd(
	ctx: Ctx,
	actor: Actor,
	input: TaskQuickAddInput
): Promise<TaskQuickAddDraft> {
	const roster = await listFamilyRoster(ctx, actor, null);
	const zone = (await getTimeZone(ctx, actor.id)) ?? 'UTC';
	const parsed = parseTaskQuickAdd(input.text, {
		now: ctx.clock.now(),
		zone,
		members: roster.members
	});

	// An unknown/ambiguous @member is never silently dropped (legacy copy).
	if (parsed.unknownMember) {
		throw invalid(
			`Unknown member ${parsed.unknownMember} — check the spelling or pick someone from your family.`
		);
	}
	// @family names a family the caller must have.
	if (parsed.familyTask && !roster.familyId) {
		throw invalid("@family needs a family — you're not in one yet.");
	}

	const fallback = input.dueDateFallback ?? null;
	// The POST body's own `dueDate` rule: a picker value that is not a date is a 400.
	if (fallback !== null && Number.isNaN(Date.parse(fallback))) throw invalid(TASK_INVALID_DUEDATE);

	// A cadence ("every 2 weeks") with no picked date still needs a cursor.
	const dueDate =
		parsed.dueDate ??
		fallback ??
		(parsed.recurrenceFrequency ? endOfDayIso(zone, ctx.clock.now()) : null);

	const category = input.category?.trim() ?? '';

	// The contract's transforms own every default (tags, priority, visibility).
	const body = TaskCreateBody.parse({
		title: parsed.title,
		dueDate,
		priority: parsed.priority,
		assignedTo: parsed.assignedTo,
		// An explicit #public/#private in the text wins over the picker.
		visibility: parsed.visibilityExplicit
			? parsed.visibility
			: normalizeTaskVisibility(input.visibilityFallback ?? undefined),
		// POST reads an absent familyId as the caller's family, so a personal
		// Task must send null explicitly (issue 019); @family names the roster's.
		familyId: parsed.familyTask ? roster.familyId : null,
		tags: parsed.tags,
		recurrenceFrequency: parsed.recurrenceFrequency,
		recurrenceInterval: parsed.recurrenceInterval,
		// Undefined is dropped by JSON.stringify — blank never reaches the wire.
		category: category || undefined
	});

	return { title: parsed.title, body };
}
