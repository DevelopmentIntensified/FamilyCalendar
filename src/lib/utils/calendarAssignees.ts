/**
 * The calendar's per-person view filter (#127, Prototype E mark 1.11).
 *
 * "By person" was a rail CARD — a list of names and counts you read but could
 * not act on. The mark asked for filter buttons instead, and the owner
 * directive turned it from an idea into work. So it is a filter: a set of user
 * ids that are switched off, one predicate every view reads, and the same
 * per-user-per-device storage `calendarVisibility` already established.
 *
 * **A view filter, not a setting.** Like the calendar filter, it says what to
 * draw. It never says who an event is created for, who a task is assigned to,
 * or where a new event lands. Different keys, different writers, disjoint
 * questions.
 *
 * **The roster is the people who have something on screen, not the family
 * roster.** `Calendar.svelte` is handed the loaded rows and nothing else — no
 * member list, no extra query — so the filter's rows are exactly the people
 * whose plans are on this calendar. That is also the honest shape for a
 * *filter*: a person with nothing here has nothing to switch on or off, and a
 * card of every member is what #103 deleted from this band.
 *
 * The counts are read from the ALREADY-FILTERED rows, so a row falls to 0 the
 * moment a search or a hidden calendar takes it away. A count of 0 is the
 * reason a filtered grid is empty, said where the filter is.
 */

/** An Event, as far as this filter is concerned. */
export interface AssigneeEventLike {
	/** The person the event belongs to. Absent/null = nobody's. */
	ownerId?: string | null;
	/** An event on no calendar is a sponsored ad (see `isAdRow`). */
	calendarId?: string | null;
	/** Attached server-side to FAMILY events only. */
	creatorName?: string | null;
}

/** A due Task, as far as this filter is concerned. */
export interface AssigneeTaskLike {
	/** The person the task is assigned to. Absent/null = nobody's. */
	assignedTo?: string | null;
	assigneeFirstName?: string | null;
	assigneeLastName?: string | null;
	calendarId?: string | null;
}

/** Either kind of row. Both carry a calendar, which is how an ad is spotted. */
export type AssigneeRowLike = AssigneeEventLike | AssigneeTaskLike;

/** One row of the filter. */
export interface AssigneeRef {
	id: string;
	name: string;
	/** True for the viewer, who is listed first and called "You". */
	isViewer: boolean;
}

/** A family member the page already loaded, in the shape it loads them. */
export interface AssigneeMember {
	userId: string;
	firstName: string;
}

/** The slice of the Web Storage API this module needs. Null means unavailable
 *  (SSR, private browsing) and degrades to "nobody hidden". */
export interface KeyValueStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}

/** The label a person gets when the app knows a first name nowhere on this
 *  surface. `attachCreatorNames` runs on FAMILY events only, so a member whose
 *  only rows are personal-calendar events arrives unnamed. The row still earns
 *  its place — the filter would otherwise hide plans nobody can switch back
 *  on — and the label admits what is known instead of guessing at one. */
const UNNAMED = 'A member';

/** Trimmed, or null for anything that is not a usable id or name. The
 *  interfaces already say `string | null | undefined`, so this narrows the
 *  declared shape rather than sniffing an untyped one. */
function clean(value: string | null | undefined): string | null {
	const trimmed = (value ?? '').trim();
	return trimmed.length > 0 ? trimmed : null;
}

/**
 * A sponsored event, by the same rule `calendarVisibility` uses: an event on
 * no calendar row is an ad, not a person's plan. No person filter may reach
 * it, exactly as no calendar toggle does.
 */
function isAdRow(row: { calendarId?: string | null }): boolean {
	return clean(row.calendarId) === null;
}

/** The one person an EVENT belongs to, or null when it belongs to nobody. */
function eventOwner(event: AssigneeEventLike): string | null {
	return isAdRow(event) ? null : clean(event.ownerId);
}

/** The one person a TASK belongs to, or null when it belongs to nobody. */
function taskAssignee(task: AssigneeTaskLike): string | null {
	return isAdRow(task) ? null : clean(task.assignedTo);
}

/** Is this person switched off? An empty id is nobody and is never hidden. */
export function isAssigneeHidden(id: string | null | undefined, hidden: readonly string[]): boolean {
	const person = clean(id);
	return person === null ? false : hidden.includes(person);
}

/** Switch one person off or on. An empty id is a no-op, like the calendar one. */
export function toggleAssigneeVisibility(hidden: readonly string[], id: string): string[] {
	if (clean(id) === null) return Array.from(hidden);
	return hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id];
}

/**
 * The one predicate every view reads: drop rows belonging to a switched-off
 * person. Applies identically to Events and to due Tasks, so switching a
 * person off takes their tasks with it. Returns a new array; the input is
 * never mutated.
 */
export function visibleByAssignee<T extends AssigneeRowLike>(
	rows: readonly T[],
	hidden: readonly string[]
): T[] {
	if (hidden.length === 0) return rows.slice();
	return rows.filter((row) => {
		const person = 'assignedTo' in row ? taskAssignee(row) : eventOwner(row);
		// Nobody's row: an ad belongs to no person and survives every filter
		// here, and anything else the app cannot attribute drops out — "only
		// this person's plans" is not a claim about unattributable rows.
		if (person === null) return isAdRow(row);
		return !hidden.includes(person);
	});
}

/** How many rows each person would keep, from the rows already on screen.
 *  A Map, not a dictionary: a key that is not there means zero, and that is
 *  a fact about the answer rather than a hole in a type. */
export function assigneeCounts(
	events: readonly AssigneeEventLike[],
	tasks: readonly AssigneeTaskLike[]
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
 * because a search query or a hidden calendar took their plans away — a filter
 * whose own options disappear is not a filter. Their count reads 0 instead.
 *
 * `members` is the family roster the page already loaded. Passing it is what
 * makes the filter complete rather than derived: a member with nothing in this
 * window is still a row with a real first name and a count of 0, and a member
 * whose only rows are personal-calendar events stops being "A member" —
 * `attachCreatorNames` runs on FAMILY events only, so the loaded rows cannot
 * name them. Someone with plans who is NO LONGER on the roster is still added,
 * because their tasks are still on the calendar and still need a way back on.
 *
 * Omit it (or pass nothing) and the roster is derived from the rows alone,
 * exactly as it was: same ids, same order, same names.
 */
export function assigneeRoster(
	events: readonly AssigneeEventLike[],
	tasks: readonly AssigneeTaskLike[],
	viewerId?: string | null,
	members: readonly AssigneeMember[] = []
): AssigneeRef[] {
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
export function hiddenAssigneeNames(roster: readonly AssigneeRef[], hidden: readonly string[]): string[] {
	return roster.filter((person) => hidden.includes(person.id)).map((person) => person.name);
}

// ---- storage, per user per device: a reading preference, not account data ----

/** Storage key — namespaced per user, beside the hidden-calendars key and
 *  never on top of it. */
export function assigneeKey(userId: string | null | undefined): string {
	return `familyplanz:hiddenAssignees:${clean(userId) ?? 'anon'}`;
}

/** Parse a stored payload. Anything unrecognised means "nobody hidden" — a
 *  corrupt value must never leave the grid permanently blank. */
export function parseHiddenAssignees(raw: string | null | undefined): string[] {
	if (!raw) return [];
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		const ids = parsed.filter((value): value is string => typeof value === 'string' && value.length > 0);
		return Array.from(new Set(ids));
	} catch {
		return [];
	}
}

export function serializeHiddenAssignees(ids: readonly string[]): string {
	return JSON.stringify(Array.from(new Set(ids)));
}

export function loadHiddenAssignees(
	storage: KeyValueStorage | null | undefined,
	userId: string | null | undefined
): string[] {
	if (!storage) return [];
	try {
		return parseHiddenAssignees(storage.getItem(assigneeKey(userId)));
	} catch {
		return [];
	}
}

/** Persist the filter. A storage that throws (private mode, quota) leaves the
 *  in-memory filter applied for this session rather than breaking the toggle. */
export function saveHiddenAssignees(
	storage: KeyValueStorage | null | undefined,
	userId: string | null | undefined,
	ids: readonly string[]
): void {
	if (!storage) return;
	try {
		storage.setItem(assigneeKey(userId), serializeHiddenAssignees(ids));
	} catch {
		/* session-only filter */
	}
}
