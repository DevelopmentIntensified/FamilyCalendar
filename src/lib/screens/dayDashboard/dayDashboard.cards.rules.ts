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
