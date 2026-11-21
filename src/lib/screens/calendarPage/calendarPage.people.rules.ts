/**
 * calendarPage person-filter rules: who a row belongs to, the filter's rows and
 * counts, the stored shape `localPref` reads and writes, and the one predicate
 * every view reads.
 *
 * A view filter, like the calendar one: it says what to draw, never who an
 * event is created for or a task assigned to. The roster is the loaded family
 * roster PLUS everyone who has rows, so a member with nothing in this window is
 * still a row with a real name and a count of 0.
 *
 * Ported from legacy `src/lib/utils/calendarAssignees.ts` (#127); its
 * `KeyValueStorage` boilerplate dies into kernel `localPref`.
 *
 * Doc: ./README.md#the-reading-filters
 */

/** An Event, as far as this filter is concerned. */
export interface CalendarAssigneeEvent {
	/** The person the event belongs to. Absent/null = nobody's. */
	ownerId?: string | null;
	/** An event on no calendar is a sponsored ad (see `isAdRow`). */
	calendarId?: string | null;
	/** Attached server-side to FAMILY events only. */
	creatorName?: string | null;
}

/** A due Task, as far as this filter is concerned. */
export interface CalendarAssigneeTask {
	/** The person the task is assigned to. Absent/null = nobody's. */
	assignedTo?: string | null;
	assigneeFirstName?: string | null;
	assigneeLastName?: string | null;
	calendarId?: string | null;
}

/** Either kind of row. Both carry a calendar, which is how an ad is spotted. */
export type CalendarAssigneeRow = CalendarAssigneeEvent | CalendarAssigneeTask;

/** One row of the filter. */
export interface CalendarAssigneeRef {
	id: string;
	name: string;
	/** True for the viewer, who is listed first and called "You". */
	isViewer: boolean;
}

/** A family member the page already loaded, in the shape it loads them. */
export interface CalendarAssigneeMember {
	userId: string;
	firstName: string;
}

/** The `localPref` version; a different stored version reads as "nobody hidden". */
export const HIDDEN_ASSIGNEES_VERSION = 1;

/**
 * The label a person gets when no loaded row names them. Their plans still earn
 * the row — a filter whose own options disappear is not a filter — and the
 * label admits what is known instead of guessing at a name.
 */
const UNNAMED = 'A member';

/** Trimmed, or null for anything that is not a usable id or name. */
function clean(value: string | null | undefined): string | null {
	const trimmed = (value ?? '').trim();
	return trimmed.length > 0 ? trimmed : null;
}

/**
 * A sponsored event, by the same rule the calendar filter uses: an event on no
 * calendar row is an ad, not a person's plan. No person filter may reach it.
 */
function isAdRow(row: { calendarId?: string | null }): boolean {
	return clean(row.calendarId) === null;
}

/** The one person an EVENT belongs to, or null when it belongs to nobody. */
function eventOwner(event: CalendarAssigneeEvent): string | null {
	return isAdRow(event) ? null : clean(event.ownerId);
}

/** The one person a TASK belongs to, or null when it belongs to nobody. */
function taskAssignee(task: CalendarAssigneeTask): string | null {
	return isAdRow(task) ? null : clean(task.assignedTo);
}

/** Is this person switched off? An empty id is nobody and is never hidden. */
export function isAssigneeHidden(
	id: string | null | undefined,
	hidden: readonly string[]
): boolean {
	const person = clean(id);
	return person === null ? false : hidden.includes(person);
}

/** Switch one person off or on. An empty id is a no-op, like the calendar one. */
export function toggleAssigneeVisibility(hidden: readonly string[], id: string): string[] {
	if (clean(id) === null) return Array.from(hidden);
	return hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id];
}

/** The one person a row belongs to; a due Task is read by its assignee. */
function personOf(row: CalendarAssigneeRow): string | null {
	return 'assignedTo' in row ? taskAssignee(row) : eventOwner(row);
}

/**
 * The one predicate every view reads: drop rows belonging to a switched-off
 * person. Applies identically to Events and to due Tasks, so switching a
 * person off takes their tasks with it. Returns a new array; the input is never
 * mutated.
 *
 * Nobody's row: an ad belongs to no person and survives every filter here; any
 * other row the app cannot attribute drops out — "only this person's plans" is
 * not a claim about unattributable rows.
 */
export function isVisibleByAssignee<T extends CalendarAssigneeRow>(
	rows: readonly T[],
	hidden: readonly string[]
): T[] {
	if (hidden.length === 0) return rows.slice();
	return rows.filter((row) => {
		const person = personOf(row);
		if (person === null) return isAdRow(row);
		return !hidden.includes(person);
	});
}

/**
 * How many rows each person would keep, from the rows already on screen.
 * A Map, not a dictionary: a key that is not there means zero, and that is a
 * fact about the answer rather than a hole in a type.
 */
export function assigneeCounts(
	events: readonly CalendarAssigneeEvent[],
	tasks: readonly CalendarAssigneeTask[]
): Map<string, number> {
	const counts = new Map<string, number>();
	for (const person of [...events.map(eventOwner), ...tasks.map(taskAssignee)]) {
		if (person) counts.set(person, (counts.get(person) ?? 0) + 1);
	}
	return counts;
}

/**
 * The filter's rows: the family roster PLUS everyone who has something, viewer
 * first then by name.
 *
 * Built from the UNFILTERED rows, so a person does not vanish from the filter
 * because a search query or a hidden calendar took their plans away. Their
 * count reads 0 instead.
 */
export function assigneeRoster(
	events: readonly CalendarAssigneeEvent[],
	tasks: readonly CalendarAssigneeTask[],
	viewerId?: string | null,
	members: readonly CalendarAssigneeMember[] = []
): CalendarAssigneeRef[] {
	// The loader attaches an assignee's name to any task and a creator's first
	// name to FAMILY events only, so the roster is the best source of all.
	const names = new Map<string, string>();
	for (const event of events) {
		const person = eventOwner(event);
		const name = clean(event.creatorName);
		if (person && name && !names.has(person)) names.set(person, name);
	}
	for (const task of tasks) {
		const person = taskAssignee(task);
		const name = clean(task.assigneeFirstName);
		if (person && name) names.set(person, name);
	}
	for (const member of members) {
		const person = clean(member.userId);
		const name = clean(member.firstName);
		if (person && name) names.set(person, name);
	}

	const ids = new Set<string>();
	for (const member of members) {
		// A member with no usable id cannot be filtered by, so a row for one
		// would be a control that does nothing.
		const person = clean(member.userId);
		if (person) ids.add(person);
	}
	for (const person of [...events.map(eventOwner), ...tasks.map(taskAssignee)]) {
		if (person) ids.add(person);
	}

	const isViewer = (id: string) => clean(viewerId) === id;

	return [...ids]
		.map((id) => ({
			id,
			name: isViewer(id) ? 'You' : (names.get(id) ?? UNNAMED),
			isViewer: isViewer(id)
		}))
		.sort((a, b) => {
			if (a.isViewer !== b.isViewer) return a.isViewer ? -1 : 1;
			return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
		});
}

/** The hidden people by name, for the empty state. Ids the roster does not
 *  know are skipped — a member who left should not haunt the copy. */
export function hiddenAssigneeNames(
	roster: readonly CalendarAssigneeRef[],
	hidden: readonly string[]
): string[] {
	return roster.filter((person) => hidden.includes(person.id)).map((person) => person.name);
}

/**
 * Storage key — namespaced per user, beside the hidden-calendars key and never
 * on top of it.
 */
export function hiddenAssigneesKey(userId: string | null | undefined): string {
	return `familyplanz:hiddenAssignees:${clean(userId) ?? 'anon'}`;
}

/**
 * Parse the stored value (`localPref` unwraps `{v, value}` first). Anything
 * unrecognised means "nobody hidden" — a corrupt value must never leave the
 * grid permanently blank.
 */
export function parseHiddenAssignees(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	const ids = value.filter((id): id is string => typeof id === 'string' && id.length > 0);
	return Array.from(new Set(ids));
}

/** The value to store: unique, non-empty ids. `localPref` adds the wrapper. */
export function serialiseHiddenAssignees(ids: readonly string[]): string[] {
	return Array.from(new Set(ids.filter((id) => id.length > 0)));
}
