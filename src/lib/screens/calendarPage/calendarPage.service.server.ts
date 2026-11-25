/**
 * calendarPage service: the ONE composition behind the page load — the shell
 * (calendars, roster, settings facts, deep-link seeds) and the streamed
 * `grid` (the visible month's Events, due Tasks and Sponsored Events).
 *
 * The screen owns no table: every read is a domain's, reached through its
 * public server interface (rule R2):
 * - `calendar` — the calendar list (it provisions the Personal Calendar) and
 *   the ranged Event read (Occurrences with RSVP, attendance and creator);
 * - `tasks` — the caller's due Tasks, filtered to the grid window here;
 * - `sponsored` — the month's Sponsored Events behind their own serve gate.
 *
 * Legacy (`+page.server.ts:31-298`) guarded each section and pushed its label
 * onto `loadWarnings`, so one broken read degraded to its fallback instead of
 * 500ing the page. The shell's legs warn into `shell.warnings`; the grid's
 * legs warn into `grid.warnings`, which the component joins — the same two
 * lists legacy rendered together. Owner Q-098 folded the legacy `family`
 * label into `calendar` (the calendar list is one read now).
 *
 * The shell is awaited; `grid` starts before the shell is returned and is
 * never awaited here, so SvelteKit streams it (`+page.svelte` awaited it).
 *
 * Doc: ./README.md#sections-degrade-and-what-the-page-reads
 */
import { DateTime } from 'luxon';
import type { Actor } from '$lib/kernel/ctx/actor';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import { dayKey } from '$lib/kernel/time/dates';
import {
	listCalendars,
	listEventsInWindow,
	type CalendarRangedEvent
} from '$lib/domains/calendar/index.server';
import type { IdentityCtx } from '$lib/domains/identity/index.server';
import { listSponsoredEvents } from '$lib/domains/sponsored/index.server';
import { listDueTasks } from '$lib/domains/tasks/index.server';
import type {
	CalendarPageAdRow,
	CalendarPageEventRow,
	CalendarPageGrid,
	CalendarPageModel,
	CalendarPageRosterMember,
	CalendarPageSeeds,
	CalendarPageSettings,
	CalendarPageTaskRow
} from './calendarPage.contract';
import {
	gridWindow,
	normaliseCalendarWeekStart,
	type CalendarGridWindow
} from './calendarPage.grid.rules';

/**
 * What the page handler hands the service: the group layout's facts (read once
 * by `parent()`), the settings the first render is composed from, and the
 * deep-link seeds the URL rules resolved.
 */
export type CalendarPageServiceInput = {
	readonly settings: CalendarPageSettings;
	readonly roster: readonly CalendarPageRosterMember[];
	readonly seeds: CalendarPageSeeds;
};

/** The four values a stored RSVP can name; anything else reads as "no answer". */
const RSVP_STATUSES = ['going', 'maybe', 'declined', 'undecided'] as const;

/**
 * One degraded section: log it (the kernel way, not `console.error`) and record
 * its label for the banner. Never rethrows — a missing section is a warning,
 * not a 500, exactly as legacy's `guard()` behaved.
 */
async function section<T>(
	ctx: Ctx,
	label: string,
	read: () => Promise<T>,
	fallback: T,
	warnings: string[]
): Promise<T> {
	try {
		return await read();
	} catch (error) {
		ctx.log.warn('calendar_page_section_failed', {
			section: label,
			message: error instanceof Error ? error.message : String(error)
		});
		warnings.push(label);
		return fallback;
	}
}

/** The month the grid draws: the seeded day's month, else the viewer's today. */
function monthOf(seedDate: string | null, today: string, zone: string): DateTime {
	const fromSeed = seedDate ? DateTime.fromISO(seedDate, { zone }) : null;
	const base = fromSeed?.isValid ? fromSeed : DateTime.fromISO(today, { zone });
	return base.startOf('month');
}

/** One occurrence as the grid draws it (contract fields only — no full rows). */
function eventRowOf(row: CalendarRangedEvent): CalendarPageEventRow {
	return {
		id: row.id,
		masterId: row.masterId ?? null,
		occurrenceDate: row.occurrenceDate ?? null,
		title: row.title ?? null,
		description: row.description ?? null,
		location: row.location ?? null,
		date: row.date,
		start: row.start ?? null,
		end: row.end ?? null,
		allDay: row.allDay === true,
		calendarId: row.calendarId ?? null,
		ownerId: row.ownerId ?? null,
		creatorName: row.creatorName ?? null,
		// SAFETY: the `includes` check proves the value is one of the union; a
		// status outside the vocabulary reads as "no answer".
		rsvpStatus: (RSVP_STATUSES as readonly string[]).includes(row.rsvpStatus ?? '')
			? (row.rsvpStatus as CalendarPageEventRow['rsvpStatus'])
			: null,
		attendance: row.attendance
			? {
					going: row.attendance.going,
					invited: row.attendance.invited,
					required: row.attendance.required,
					requiredPending: row.attendance.requiredPending,
					goingNames: [...row.attendance.goingNames]
				}
			: null,
		recurrenceFrequency: row.recurrenceFrequency ?? null
	};
}

/** A Sponsored Event as the grid draws it: on no calendar, so amber by kind. */
function adRowOf(row: {
	readonly id: string;
	readonly title: string;
	readonly description: string;
	readonly start: string;
	readonly end: string;
	readonly date: string;
	readonly ownerId: string;
}): CalendarPageAdRow {
	return {
		id: row.id,
		masterId: null,
		occurrenceDate: null,
		title: row.title,
		description: row.description,
		location: null,
		date: row.date,
		start: row.start,
		end: row.end,
		allDay: true,
		calendarId: null,
		ownerId: row.ownerId,
		creatorName: null,
		rsvpStatus: null,
		attendance: null,
		recurrenceFrequency: null
	};
}

/** Is a day key inside the month matrix (inclusive)? ISO day keys sort as text. */
function inWindow(day: string, window: CalendarGridWindow): boolean {
	return window.from !== '' && window.to !== '' && day >= window.from && day <= window.to;
}

/**
 * The viewer's due Tasks for the window: a Task with a due date, not completed,
 * riding the calendar of its parent Event — or the viewer's Personal Calendar
 * when it has none (`+page.server.ts:214-247`) — so hiding a calendar takes its
 * due Tasks with it.
 *
 * The read is tasks' own due window (`listDueTasks`); its bounds are UTC
 * instants, so one day either side is asked for and the viewer's ZONE decides
 * the edge rows — the same day rule every grid cell uses.
 */
async function dueTaskRows(
	ctx: Ctx,
	actor: Actor,
	input: {
		readonly window: CalendarGridWindow;
		readonly zone: string;
		readonly personalCalendarId: string | null;
	}
): Promise<CalendarPageTaskRow[]> {
	// A viewer-zone day is not a UTC day: ask a day wide, then keep the window.
	const pad = (day: string, days: number) =>
		(DateTime.fromISO(day, { zone: input.zone }).plus({ days }).toUTC().toISO() ?? '');
	const rows = await listDueTasks(ctx, actor, {
		fromIso: pad(input.window.from, -1),
		toIso: pad(input.window.to, 1)
	});
	return rows.flatMap((task): CalendarPageTaskRow[] => {
		if (!task.dueDate || task.completedAt) return [];
		const day = dayKey(task.dueDate, input.zone);
		if (!inWindow(day, input.window)) return [];
		return [
			{
				id: task.id,
				title: task.title,
				dueDate: task.dueDate,
				calendarId: task.eventCalendarId ?? input.personalCalendarId ?? null,
				assignedTo: task.assignedTo ?? null,
				assigneeFirstName: task.assigneeFirstName ?? null,
				assigneeLastName: task.assigneeLastName ?? null,
				recurrenceFrequency: task.recurrenceFrequency ?? null,
				recurrenceInterval: task.recurrenceInterval ?? null
			}
		];
	});
}

/**
 * The ctx every ads read needs: the app attaches identity's two ports to every
 * ctx (`src/lib/app/ports.server.ts`). Fails loudly when the wiring is missing
 * rather than reading through `undefined` — the same guard sponsored's own
 * handler uses. The caller's `section()` turns that into the legacy `ads`
 * warning, so an unwired build degrades like a failed read instead of 500ing.
 */
function identityCtx(ctx: Ctx): IdentityCtx {
	if (!('calendarAccess' in ctx) || !('adConsent' in ctx)) {
		throw new Error(
			'identity ports are not wired: src/lib/app/ports.server.ts must attach calendarAccess and adConsent'
		);
	}
	return ctx as IdentityCtx;
}

/**
 * The streamed half: the window's Events, its due Tasks and the month's
 * Sponsored Events. Sequential, not `Promise.all`: `ctx.db` may be one
 * transaction session (the same constraint the domain services document), and
 * each leg's failure is its own warning.
 */
async function loadGrid(
	ctx: Ctx,
	actor: Actor,
	input: {
		readonly window: CalendarGridWindow;
		readonly zone: string;
		readonly personalCalendarId: string | null;
		readonly showAds: boolean;
	}
): Promise<CalendarPageGrid> {
	const warnings: string[] = [];

	const events = await section(
		ctx,
		'events',
		async () => {
			// The ranged read pads a grid week either side (calendar.range.rules
			// PAD_MS, so a client fetch can fill adjacent cells); this model is
			// the matrix itself, so the padding is dropped here.
			const ranged = await listEventsInWindow(ctx, actor, input.window);
			return ranged.events
				.map(eventRowOf)
				.filter((row) => inWindow(dayKey(row.date, input.zone), input.window));
		},
		[] as CalendarPageEventRow[],
		warnings
	);

	const tasks = await section(
		ctx,
		'tasks',
		async () => await dueTaskRows(ctx, actor, input),
		[] as CalendarPageTaskRow[],
		warnings
	);

	// The gate is the identity setting the layout already loaded: no read at
	// all when ads are off (`calendarData.ts:78-81`).
	let ads: CalendarPageAdRow[] = [];
	if (input.showAds) {
		ads = await section(
			ctx,
			'ads',
			async () => {
				const month = await listSponsoredEvents(identityCtx(ctx), actor, {
					now: ctx.clock.now()
				});
				return month
					.map(adRowOf)
					.filter((row) => inWindow(dayKey(row.date, input.zone), input.window));
			},
			[] as CalendarPageAdRow[],
			warnings
		);
	}

	return { events, tasks, ads, warnings };
}

/**
 * The one use-case: build the shell, start `grid`, return the model. The shell
 * holds what renders before the grid (calendars, roster, settings, seeds, the
 * url-resolved date and view), so the toolbar is usable while rows stream in.
 */
export async function getCalendarPage(
	ctx: Ctx,
	actor: Actor,
	input: CalendarPageServiceInput
): Promise<CalendarPageModel> {
	const zone = input.settings.timeZone || 'UTC';
	const weekStart = normaliseCalendarWeekStart(input.settings.weekStart);
	const now = ctx.clock.now();
	const today = dayKey(now, zone);
	const month = monthOf(input.seeds.date, today, zone);
	const window = gridWindow(month, weekStart);

	const warnings: string[] = [];
	const calendars = await section(
		ctx,
		'calendar',
		async () => (await listCalendars(ctx, actor)).calendars,
		[],
		warnings
	);
	const personalCalendarId = calendars.find((calendar) => calendar.kind === 'personal')?.id ?? null;

	// Started before the shell is returned; the route awaits the shell only, so
	// this promise streams (SvelteKit serialises it as a deferred node).
	const grid = loadGrid(ctx, actor, {
		window,
		zone,
		personalCalendarId,
		showAds: input.settings.showAdsAsEvents
	});

	return {
		shell: {
			viewerId: actor.id,
			today,
			zone,
			weekStart,
			settings: input.settings,
			calendars: calendars.map((calendar) => ({
				id: calendar.id,
				name: calendar.name,
				color: calendar.color,
				kind: calendar.kind
			})),
			roster: input.roster.map((member) => ({
				userId: member.userId,
				firstName: member.firstName,
				lastName: member.lastName
			})),
			seeds: input.seeds,
			warnings
		},
		grid
	};
}
