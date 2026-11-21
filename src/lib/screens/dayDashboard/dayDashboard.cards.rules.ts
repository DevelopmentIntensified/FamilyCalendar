/**
 * dayDashboard card rules: the two presentations the screen owns and no domain
 * does — how a day's events read as glance rows, and how they group per child.
 *
 * Both rules were read off the legacy cards on 2026-11-11 and kept exactly:
 * `TodayGlanceCard.svelte:38-46` splits all-day rows (payload order) from timed
 * rows (by start), and `KidsScheduleCard.svelte:51-89` puts one band per child,
 * in the order that child's first event starts, repeating a shared event under
 * every child attending it — and draws the child's initials from the name.
 *
 * Pure: rows in, rows out; no clock, no zone, no DOM. The card still formats
 * times and colours avatars — those are presentation over the reader's locale
 * and the family palette, not an order.
 *
 * Doc: ./README.md#invariants
 */
import type { TaskQuickAddResult } from '$lib/domains/parsing';
import type { TaskCreateBody } from '$lib/domains/tasks';

/** The fields the glance ordering reads: the flag and the start of one day event. */
export type GlanceOrderRow = {
	readonly allDay: boolean;
	readonly start: string | Date;
};

/**
 * Glance rows, in the order the card draws them: every all-day row first (in
 * the payload's own order — the query does not sort them), then the timed rows
 * by start. Invalid starts compare as `NaN`, which `sort` reads as "equal", so
 * a malformed row keeps its place instead of jumping to the top.
 */
export function orderGlanceEvents<T extends GlanceOrderRow>(events: readonly T[]): T[] {
	const allDay = events.filter((event) => event.allDay);
	const timed = events.filter((event) => !event.allDay).sort((a, b) => {
		const aStart = a.start instanceof Date ? a.start.getTime() : new Date(a.start).getTime();
		const bStart = b.start instanceof Date ? b.start.getTime() : new Date(b.start).getTime();
		return aStart - bStart;
	});
	return [...allDay, ...timed];
}

/** One child attending an event, by id (the stable key) and display name. */
export type KidsScheduleKid = {
	readonly id: string;
	readonly name: string;
};

/** The fields Kids' Schedule grouping reads from a day event. */
export type KidsScheduleRow = {
	readonly start: string;
	readonly allDay: boolean;
	readonly kids: readonly KidsScheduleKid[];
};

/** One child's band: the child and their events, earliest first. */
export type KidsScheduleGroup<T extends KidsScheduleRow = KidsScheduleRow> = {
	readonly kid: KidsScheduleKid;
	readonly events: T[];
};

/**
 * Kids' Schedule bands: one per child, in the order that child's first event
 * starts (all-day events first within a band). A child seen again — a second
 * event, or a second name spelling — keeps the first `{id, name}` seen, so a
 * band is keyed by id and never split by a name. An event shared by two
 * children appears under both (072: it was one card with two chips, which made
 * "Mia's Tuesday" unreadable as a column).
 */
export function groupKidsSchedule<T extends KidsScheduleRow>(
	events: readonly T[]
): KidsScheduleGroup<T>[] {
	const order: KidsScheduleKid[] = [];
	const byKid = new Map<string, KidsScheduleGroup<T>>();
	// All-day rows lead a band; timed rows follow by start (legacy `sortByStart`).
	const sorted = [...events].sort((a, b) => {
		if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
		return new Date(a.start).getTime() - new Date(b.start).getTime();
	});
	for (const event of sorted) {
		for (const kid of event.kids) {
			let group = byKid.get(kid.id);
			if (!group) {
				group = { kid, events: [] };
				byKid.set(kid.id, group);
				order.push(kid);
			}
			group.events.push(event);
		}
	}
	const groups: KidsScheduleGroup<T>[] = [];
	for (const kid of order) {
		const group = byKid.get(kid.id);
		if (group) groups.push(group);
	}
	return groups;
}

/**
 * Up to two initials for a child's avatar: the first letter of the first two
 * words, uppercased. A blank name draws `?` (legacy `KidsScheduleCard.svelte`
 * `initials`); the avatar COLOUR stays the card's, derived from the child id.
 */
export function initialsFromName(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return '?';
	return parts
		.slice(0, 2)
		.map((part) => part[0].toUpperCase())
		.join('');
}

// --- Glance RSVP badge -------------------------------------------------------

/** The badge a glance row draws for the viewer's answer to a family event. */
export type GlanceRsvpVisual = {
	readonly label: string;
	readonly icon: string;
	/** Extra classes on the row's shell (`opacity-60` for a declined event). */
	readonly containerClass: string;
	readonly badgeClass: string;
};

/**
 * The RSVP badge, exactly the legacy `utils/eventChip.rsvpVisual` table: Going
 * and Maybe tint the row's ring, a decline dims it, and no answer draws
 * nothing at all (an own, un-invited event has no attendance row).
 */
export function glanceRsvpVisual(status?: string | null): GlanceRsvpVisual | null {
	switch (status) {
		case 'going':
			return {
				label: 'Going',
				icon: '✓',
				containerClass: 'ring-1 ring-inset ring-emerald-400/60',
				badgeClass: 'bg-emerald-100 text-emerald-700'
			};
		case 'maybe':
			return {
				label: 'Maybe',
				icon: '?',
				containerClass: 'ring-1 ring-inset ring-amber-400/60',
				badgeClass: 'bg-amber-100 text-amber-700'
			};
		case 'declined':
			return {
				label: "Can't go",
				icon: '✕',
				containerClass: 'opacity-60 saturate-50',
				badgeClass: 'bg-slate-200 text-slate-500'
			};
		default:
			return null;
	}
}

// --- Family Task Board columns ----------------------------------------------

/** What a board row must carry to be grouped and ordered. */
export type BoardTaskRow = {
	readonly id: string;
	readonly title: string;
	readonly dueDate: string | null;
	readonly completedAt: string | null;
};

/** One board column: a person (or a removed member's id) and their open rows. */
export type BoardTaskColumn<T extends BoardTaskRow = BoardTaskRow> = {
	readonly ownerId: string;
	readonly name: string;
	readonly tasks: T[];
};

/**
 * The board's columns: the union of the rows' owners and the whole roster, so
 * a member with nothing assigned still gets a column that says so, and a member
 * who left the family keeps theirs while their Tasks are still open. Columns
 * are viewer-first, then by name (and id, so two identical names stay stable);
 * inside a column the order is urgency — overdue → due today → later → no due,
 * then earliest due (legacy `compareUrgency`).
 */
export function groupBoardTasks<T extends BoardTaskRow & { readonly assignedTo: string | null; readonly userId: string }>(
	rows: readonly T[],
	input: {
		readonly rosterIds: readonly string[];
		readonly meId: string;
		readonly nameFor: (ownerId: string) => string;
		readonly now: Date;
	}
): BoardTaskColumn<T>[] {
	const byOwner = new Map<string, T[]>();
	for (const row of rows) {
		const ownerId = row.assignedTo ?? row.userId;
		const column = byOwner.get(ownerId);
		if (column) column.push(row);
		else byOwner.set(ownerId, [row]);
	}
	const todayStart = new Date(input.now.getFullYear(), input.now.getMonth(), input.now.getDate()).getTime();
	const tomorrow = todayStart + 86_400_000;
	const bucketRank = (row: T): number => {
		const due = row.dueDate ? Date.parse(row.dueDate) : Number.NaN;
		if (Number.isNaN(due)) return 3;
		if (due < todayStart) return 0;
		if (due < tomorrow) return 1;
		return 2;
	};
	const dueTime = (row: T): number => {
		const due = row.dueDate ? Date.parse(row.dueDate) : Number.NaN;
		return Number.isNaN(due) ? Number.MAX_SAFE_INTEGER : due;
	};

	return [...new Set([...byOwner.keys(), ...input.rosterIds])]
		.map((ownerId) => ({
			ownerId,
			name: input.nameFor(ownerId),
			tasks: [...(byOwner.get(ownerId) ?? [])].sort(
				(a, b) =>
					bucketRank(a) - bucketRank(b) ||
					dueTime(a) - dueTime(b) ||
					a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
			)
		}))
		.sort((a, b) => {
			if (a.ownerId === input.meId) return -1;
			if (b.ownerId === input.meId) return 1;
			return a.name.localeCompare(b.name) || a.ownerId.localeCompare(b.ownerId);
		});
}

// --- Board quick-add body ----------------------------------------------------

/**
 * The body the board's quick-add posts: the parsed title with its due date,
 * priority, tags and cadence, filed to the family, assigned to the `@member`
 * (or the creator, who then owns it), public by default, and the category field
 * only when something was typed (a blank never reaches the wire). Unlike the
 * tasks page's personal quick-add, a board task is always a Family Task.
 */
export function familyBoardTaskBody(
	parsed: TaskQuickAddResult,
	input: {
		readonly familyId: string;
		readonly meId: string;
		readonly category: string;
	}
): TaskCreateBody {
	const body: TaskCreateBody = {
		title: parsed.title,
		dueDate: parsed.dueDate,
		familyId: input.familyId,
		assignedTo: parsed.assignedTo ?? input.meId,
		priority: parsed.priority,
		visibility: 'public',
		tags: parsed.tags,
		recurrenceFrequency: parsed.recurrenceFrequency,
		recurrenceInterval: parsed.recurrenceInterval
	};
	const category = input.category.trim();
	if (category) body.category = category;
	return body;
}

// --- Task card tones (the shared palette, with "now" passed in) -------------

/** The priority chips a card can set, low → high (legacy `PRIORITY_ORDER`). */
export const DASHBOARD_PRIORITY_ORDER = ['low', 'normal', 'high'] as const;

/** Due chip tone: overdue red / today amber / later grey; '' without a due date. */
export function dashboardDueTone(due: string | null | undefined, now: Date): string {
	if (!due) return '';
	const at = Date.parse(due);
	if (Number.isNaN(at)) return 'bg-slate-100 text-slate-600';
	const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
	const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
	if (at < start) return 'bg-red-100 text-red-700';
	if (at <= end) return 'bg-amber-100 text-amber-700';
	return 'bg-slate-100 text-slate-600';
}

/** Label chip tone: high shouts, normal neutral, low muted. */
export function dashboardPriorityTone(priority: string): string {
	if (priority === 'high') return 'bg-red-100 text-red-700';
	if (priority === 'low') return 'bg-slate-100 text-slate-500';
	return 'bg-slate-100 text-slate-600';
}
