/**
 * calendarPage fetched-month cache: the bounded 12-month store behind the grid.
 *
 * The page load covers ONE month's matrix (#082/#201); every other month the
 * person walks to is fetched once through the ranged read and kept, so going
 * back is instant. The rules it keeps:
 *
 * - the month ON SCREEN is the trigger, not the arrow or the picker;
 * - at most twelve fetched months are held — the oldest is evicted and becomes
 *   refetchable;
 * - a refetch replaces that month wholesale (edits and deletes land), never
 *   appends;
 * - a fetch that started before the page data reloaded is discarded
 *   (generation guard), and the month on screen keeps drawing until its
 *   replacement lands;
 * - a failed month is marked attempted (no hot retry) and toasted
 *   `Couldn't load that month's events — try again.`
 *
 * Ported from legacy `Calendar.svelte:183-303`; the fetch is injected (the
 * calendar api in the browser, a fake in tests), never `fetch` here.
 *
 * Doc: ./README.md#the-bounded-month-window-and-the-fetched-month-cache
 */
import { DateTime } from 'luxon';
import type { CalendarDisplayEventWire } from '$lib/domains/calendar/index';
import type { Toasts } from '$lib/kernel/client/toasts.svelte';
import { dayKey } from '$lib/kernel/time/dates';
import type { CalendarPageEventRow } from './calendarPage.contract';
import { gridWindow, type CalendarWeekStart } from './calendarPage.grid.rules';

/** The four RSVP words a fetched row can carry; anything else is "no answer". */
const RSVP_STATUSES = ['going', 'maybe', 'declined', 'undecided'] as const;

/**
 * One `GET /api/events` row as the grid draws it. The wire is the display
 * shape already (`CalendarDisplayEventWire`), so this only drops what the
 * screen does not render and narrows `rsvpStatus` to its closed union.
 */
export function calendarRangeRowOf(wire: CalendarDisplayEventWire): CalendarPageEventRow {
	return {
		id: wire.id,
		masterId: wire.masterId,
		occurrenceDate: wire.occurrenceDate,
		title: wire.title,
		description: wire.description,
		location: wire.location,
		date: wire.date,
		start: wire.start,
		end: wire.end,
		allDay: wire.allDay,
		calendarId: wire.calendarId,
		ownerId: wire.ownerId,
		creatorName: wire.creatorName ?? null,
		// SAFETY: the `includes` check proves the value is one of the union.
		rsvpStatus: (RSVP_STATUSES as readonly string[]).includes(wire.rsvpStatus ?? '')
			? (wire.rsvpStatus as CalendarPageEventRow['rsvpStatus'])
			: null,
		attendance: wire.attendance
			? {
					going: wire.attendance.going,
					invited: wire.attendance.invited,
					required: wire.attendance.required,
					requiredPending: wire.attendance.requiredPending,
					goingNames: [...wire.attendance.goingNames]
				}
			: null,
		recurrenceFrequency: wire.recurrenceFrequency
	};
}

/** What one month's fetch returns: the same row shape the page load carries. */
export type CalendarRangeSource = (
	from: string,
	to: string
) => Promise<readonly CalendarPageEventRow[]>;

/** How many fetched months are held before the oldest is evicted. */
export const CALENDAR_RANGE_CACHE_MAX = 12;

export type CalendarRangeCacheOptions = {
	/** The viewer's week start, so the fetch asks for the same matrix the load did. */
	readonly weekStart: CalendarWeekStart;
	/** The viewer's zone: a fetched row is kept by ITS day, like the page load's. */
	readonly zone: string;
	/** Months the server already loaded (`yyyy-MM`): never refetched until a mutation. */
	readonly serverLoadedMonths: readonly string[];
	readonly toasts: Toasts;
};

export class CalendarRangeCache {
	/** Fetched rows per `yyyy-MM`, in load order (the eviction order). */
	byMonth = $state<Record<string, CalendarPageEventRow[]>>({});
	/** Months already held or attempted (a failure is also "attempted"). */
	held = $state<string[]>([]);
	busy = $state<string[]>([]);

	private generation = 0;
	private readonly weekStart: CalendarWeekStart;
	private readonly zone: string;
	private readonly serverLoaded: readonly string[];
	private readonly toasts: Toasts;

	constructor(options: CalendarRangeCacheOptions) {
		this.weekStart = options.weekStart;
		this.zone = options.zone;
		this.serverLoaded = options.serverLoadedMonths;
		this.toasts = options.toasts;
		this.held = [...options.serverLoadedMonths];
	}

	/** Rows from every fetched month, in load order (page-load rows win the merge). */
	rows(): CalendarPageEventRow[] {
		return Object.values(this.byMonth).flat();
	}

	isBusy(month: string): boolean {
		return this.busy.includes(month);
	}

	/**
	 * Ask for the month whose grid is on screen. Cheap and idempotent: a held,
	 * attempted, busy or server-loaded month returns at once. Bounds are the
	 * month's own matrix, exactly what the page load asked for.
	 */
	async request(month: string, load: CalendarRangeSource): Promise<void> {
		if (
			this.busy.includes(month) ||
			this.held.includes(month) ||
			this.serverLoaded.includes(month)
		) {
			return;
		}
		const anchor = DateTime.fromISO(`${month}-01`);
		if (!anchor.isValid) return;
		const window = gridWindow(anchor, this.weekStart);
		if (window.from === '' || window.to === '') return;

		this.busy = [...this.busy, month];
		const generation = this.generation;
		try {
			// The ranged read pads a grid week either side (so a client fetch can
			// fill adjacent cells); this cache holds the matrix itself.
			const rows = (await load(window.from, window.to)).filter((row) => {
				const day = dayKey(row.date, this.zone);
				return day >= window.from && day <= window.to;
			});
			if (generation !== this.generation) return;
			this.byMonth = { ...this.byMonth, [month]: rows };
			this.hold(month);
		} catch {
			if (generation !== this.generation) return;
			// Attempted even on failure: the guard would otherwise retry hot.
			this.hold(month);
			this.toasts.error("Couldn't load that month's events — try again.");
		} finally {
			if (generation === this.generation) {
				this.busy = this.busy.filter((entry) => entry !== month);
			}
		}
	}

	/**
	 * The page data reloaded (every write ends in `invalidateAll`): fetched
	 * months are stale. Rows for the month on screen are kept so the grid never
	 * flashes empty while its replacement lands, and that month becomes
	 * fetchable again.
	 */
	invalidate(visibleMonth: string): void {
		this.generation += 1;
		this.busy = [];
		const keep = this.byMonth[visibleMonth];
		this.byMonth = keep ? { [visibleMonth]: keep } : {};
		this.held = [...this.serverLoaded];
	}

	/** Record a month as held, evicting the oldest beyond the cap. */
	private hold(month: string): void {
		const next = [...this.held.filter((entry) => entry !== month), month];
		if (next.length <= CALENDAR_RANGE_CACHE_MAX) {
			this.held = next;
			return;
		}
		const evicted = next.slice(0, next.length - CALENDAR_RANGE_CACHE_MAX);
		this.held = next.slice(-CALENDAR_RANGE_CACHE_MAX);
		const byMonth = { ...this.byMonth };
		for (const entry of evicted) delete byMonth[entry];
		this.byMonth = byMonth;
	}
}
