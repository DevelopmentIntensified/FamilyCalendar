/**
 * calendar calendars: the viewer's calendar list, the printable month, the
 * `events_changed` nudge audience, and the two adapters this module owes its
 * neighbours (`FamilyCalendarPort` for family's create door,
 * `CalendarAccessPort` for identity's default-calendar picker).
 *
 * Ported from `calendarData.ts` + `printData.ts`. The personal calendar is
 * ensured (never duplicated), the family calendar is the FIRST row of the
 * viewer's oldest family, and the colours are this module's own palette, not
 * identity's merged view: no settings row means `#fa8072`, not `#3b82f6`
 * (`getCalendarPreferences` keeps the stored nulls).
 *
 * The printable month keeps the legacy ±2-year expansion window (Q-049) even
 * though it prints one month — `calendar.bulk.http.db.test.ts` pins both the
 * grid and the cap's effect on a long series.
 *
 * Doc: ./README.md#invariants
 */
import { DateTime } from 'luxon';
import type { Actor } from '$lib/kernel/ctx/actor';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import { nudgeEventsChanged } from '$lib/domains/alerts/index.server';
import {
	listFamilies,
	listPersonFamilyIds,
	resolveMembershipFamilyId,
	type FamilyCalendarPort
} from '$lib/domains/family/index.server';
import {
	getCalendarPreferences,
	getTimeZone
} from '$lib/domains/identity/index.server';
import type { CalendarAccessPort } from '$lib/domains/identity/index.server';
import { splitEventsByDay } from './calendar.chips.rules';
import { expandEventOccurrences } from './calendar.occurrence.rules';
import {
	calendarPrintGrid,
	MONTH_NAMES,
	monthNeighbours,
	type PrintCell,
	type PrintSourceItem,
	type WeekStart
} from './calendar.print.rules';
import {
	ensurePersonalCalendarRow,
	findAccessibleCalendarIds,
	findCalendars,
	findExceptions,
	insertCalendarRow,
	listEventsByCalendar,
	listFamilyCalendars
} from './calendar.repo.server';

export const CALENDAR_PERSONAL_NAME = 'Personal Calendar';
export const CALENDAR_DEFAULT_PERSONAL_COLOR = '#fa8072';
export const CALENDAR_DEFAULT_FAMILY_COLOR = '#e0ffff';
/** The name a family calendar falls back to when the family row has none. */
const FAMILY_CALENDAR_FALLBACK_NAME = 'Family Calendar';

/** One row of `GET /api/calendars`: the chip's label and tint. */
export type CalendarSummaryRow = {
	readonly id: string;
	readonly name: string;
	readonly color: string;
	readonly kind: 'personal' | 'family';
};

/** The printable month the fridge sheet renders (`GET /api/print`). */
export type CalendarPrintMonth = {
	readonly year: number;
	readonly month: number;
	readonly monthName: string;
	readonly weekStart: WeekStart;
	readonly familyName: string | null;
	readonly grid: PrintCell[];
	readonly prev: { readonly year: number; readonly month: number };
	readonly next: { readonly year: number; readonly month: number };
	readonly isCurrentMonth: boolean;
};

/** The personal calendar's display colour (settings `color`, else salmon). */
export function personalCalendarColor(settings: { readonly color?: string | null } | null | undefined) {
	return settings?.color || CALENDAR_DEFAULT_PERSONAL_COLOR;
}

/**
 * The calendars the viewer sees, named and coloured as the page shows them:
 * personal first (created when missing), then the family calendar when there
 * is one.
 */
export async function listCalendars(
	ctx: Ctx,
	actor: Actor
): Promise<{ readonly calendars: CalendarSummaryRow[] }> {
	// Sequential, not Promise.all: the ctx db may be one transaction session.
	const preferences = await getCalendarPreferences(ctx, actor.id);
	const personal = await ensurePersonalCalendarRow(ctx.db, actor.id, ctx.clock.now());
	const familyId = await resolveMembershipFamilyId(ctx, actor.id);

	const calendars: CalendarSummaryRow[] = [];
	if (personal) {
		calendars.push({
			id: personal.id,
			name: CALENDAR_PERSONAL_NAME,
			color: personalCalendarColor(preferences),
			kind: 'personal'
		});
	}

	if (familyId) {
		const familyCalendars = await listFamilyCalendars(ctx.db, familyId);
		const family = await listFamilies(ctx, actor);
		const calendar = familyCalendars[0];
		if (calendar) {
			const card = family.families.find((entry) => entry.id === familyId);
			calendars.push({
				id: calendar.id,
				name: card?.name || FAMILY_CALENDAR_FALLBACK_NAME,
				color: card?.color || CALENDAR_DEFAULT_FAMILY_COLOR,
				kind: 'family'
			});
		}
	}

	return { calendars };
}

/** The legacy expansion window: "now" ± 2×365 days (Q-049). */
function legacyExpansionWindow(now: Date): { readonly start: Date; readonly end: Date } {
	const oneDayMs = 24 * 60 * 60 * 1000;
	return {
		start: new Date(now.getTime() - 2 * 365 * oneDayMs),
		end: new Date(now.getTime() + 2 * 365 * oneDayMs)
	};
}

/**
 * The printable month. `year`/`month` are the raw query values: missing or
 * unparseable reads as the viewer's current month, and the month clamps into
 * 1–12 (`month=0` is falsy, so it reads as "current" too).
 */
export async function getPrintMonth(
	ctx: Ctx,
	actor: Actor,
	input: { readonly year?: string | null; readonly month?: string | null }
): Promise<CalendarPrintMonth> {
	const now = ctx.clock.now();
	// Sequential, not Promise.all: the ctx db may be one transaction session.
	const preferences = await getCalendarPreferences(ctx, actor.id);
	const zone = await getTimeZone(ctx, actor.id);
	const personal = await ensurePersonalCalendarRow(ctx.db, actor.id, now);
	const familyId = await resolveMembershipFamilyId(ctx, actor.id);
	const viewerZone = zone ?? 'utc';
	const viewerNow = DateTime.fromJSDate(now, { zone: viewerZone });

	const year = Number.parseInt(input.year ?? '', 10) || viewerNow.year;
	const month = Math.min(12, Math.max(1, Number.parseInt(input.month ?? '', 10) || viewerNow.month));
	const weekStart: WeekStart = preferences.weekStart === 'monday' ? 'monday' : 'sunday';
	const personalColor = preferences.color || CALENDAR_DEFAULT_PERSONAL_COLOR;

	let familyName: string | null = null;
	let familyColor = CALENDAR_DEFAULT_FAMILY_COLOR;
	let familyCalendarId: string | null = null;
	if (familyId) {
		const familyCalendars = await listFamilyCalendars(ctx.db, familyId);
		const family = await listFamilies(ctx, actor);
		familyCalendarId = familyCalendars[0]?.id ?? null;
		const card = family.families.find((entry) => entry.id === familyId);
		familyName = card?.name ?? null;
		familyColor = card?.color || CALENDAR_DEFAULT_FAMILY_COLOR;
	}

	const personalRows = personal ? await listEventsByCalendar(ctx.db, personal.id) : [];
	const familyRows = familyCalendarId
		? await listEventsByCalendar(ctx.db, familyCalendarId)
		: [];

	const exceptions = await findExceptions(ctx.db, [
		...personalRows.map((row) => row.id),
		...familyRows.map((row) => row.id)
	]);
	const bounds = legacyExpansionWindow(now);
	const expand = (rows: typeof personalRows) =>
		splitEventsByDay(expandEventOccurrences(rows, exceptions, bounds, viewerZone), viewerZone);

	const items: PrintSourceItem[] = [
		...expand(personalRows).map((entry) => ({
			title: entry.title,
			color: personalColor,
			allDay: entry.allDay,
			start: entry.start,
			date: entry.date
		})),
		...expand(familyRows).map((entry) => ({
			title: entry.title,
			color: familyColor,
			allDay: entry.allDay,
			start: entry.start,
			date: entry.date
		}))
	];

	const grid = calendarPrintGrid({
		year,
		month,
		weekStart,
		todayIso: viewerNow.toISODate() ?? '',
		items,
		zone: viewerZone
	});
	const { prev, next } = monthNeighbours(year, month);

	return {
		year,
		month,
		monthName: MONTH_NAMES[month - 1],
		weekStart,
		familyName,
		grid,
		prev,
		next,
		isCurrentMonth: year === viewerNow.year && month === viewerNow.month
	};
}

/**
 * The silent `events_changed` fan-out after a mutation: ONE nudge per request,
 * never awaited by the caller, and no read at all when device push is off
 * (legacy `isFcmConfigured()` gate).
 *
 * The audience is the actor plus every owner of a touched-or-accessible
 * calendar plus the members of those calendars' families — a superset is fine,
 * the message is silent and collapsed (#272/#281).
 */
export async function nudgeCalendarEventsChanged(
	ctx: Ctx,
	actor: Actor,
	calendarIds: readonly (string | null | undefined)[]
): Promise<void> {
	if (!ctx.push.devicesConfigured()) return;
	try {
		const touched = calendarIds.filter((id): id is string => !!id);
		const familyIds = await listPersonFamilyIds(ctx, actor.id);
		const accessible = await findAccessibleCalendarIds(ctx.db, actor.id, familyIds);
		const rows = await findCalendars(ctx.db, [...new Set([...touched, ...accessible])]);

		const ownerIds = rows.flatMap((row) => (row.ownerId ? [row.ownerId] : []));
		const touchedFamilyIds = [
			...new Set(rows.flatMap((row) => (row.familyId ? [row.familyId] : [])))
		];
		const roster =
			touchedFamilyIds.length > 0
				? (await listFamilies(ctx, actor)).roster.filter((member) =>
						touchedFamilyIds.includes(member.familyId)
					)
				: [];

		await nudgeEventsChanged(ctx, actor, {
			userIds: [...ownerIds, ...roster.map((member) => member.userId)]
		});
	} catch (error) {
		ctx.log.error('calendar_events_changed_nudge_failed', {
			message: error instanceof Error ? error.message : String(error)
		});
	}
}

/**
 * `FamilyCalendarPort`: the family calendar row. It writes through the ctx it
 * is handed, so the caller decides the transaction — family's create door
 * passes its own when it wants the family and its calendar to commit together.
 */
export function createFamilyCalendarPort(): FamilyCalendarPort {
	return {
		async createFamilyCalendar(ctx: Ctx, familyId: string): Promise<void> {
			await insertCalendarRow(ctx.db, { familyId, createdAt: ctx.clock.now() });
		}
	};
}

/**
 * `CalendarAccessPort`: identity's default-calendar picker needs the ids of
 * the viewer's personal calendars plus the calendar of EVERY family they
 * belong to (#098).
 */
export function createCalendarAccessPort(ctx: Ctx): CalendarAccessPort {
	return {
		async listAccessibleCalendarIds(userId: string): Promise<readonly string[]> {
			const familyIds = await listPersonFamilyIds(ctx, userId);
			return await findAccessibleCalendarIds(ctx.db, userId, familyIds);
		}
	};
}
