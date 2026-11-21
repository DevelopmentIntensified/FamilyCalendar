/**
 * dayDashboard service: the ONE composition behind `/calendar/dashboard` and
 * its `/api/dashboard` twin (G8) — the viewed day's events, Top-3 Priorities,
 * the Family Task Board, Kids' Schedule, the day's wins, the weekly streak and
 * the two grocery lists.
 *
 * Every leg is a domain read reached through its public entry: identity owns
 * the zone and the stored colour, dashboardModules the one visibility answer,
 * family the membership and the roster, tasks the lists/ranking/completions/
 * streak, calendar the day's events and their attendance, groceries its lists.
 * The screen owns only the composition and the card band's data shape.
 *
 * Each leg degrades to its fallback and records its label, in the legacy order
 * (the page's `settings` label first, then `tasks`, `events`, `task-wins`,
 * `streak`, `family`); groceries degrade silently (Q-096's recorded default).
 * A leg no visible module needs is never issued (`visibility.needs`).
 *
 * Time comes from `ctx.clock` (R5): the viewed day is `?date=` read in the
 * viewer's zone, absent or impossible = today. Nothing here writes: the
 * personal calendar is only ensured by the calendar list read, and only when
 * the day actually has events to classify.
 *
 * Doc: ./README.md#invariants
 */
import { DateTime } from 'luxon';
import type { Actor } from '$lib/kernel/ctx/actor';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import {
	CALENDAR_DEFAULT_FAMILY_COLOR,
	CALENDAR_DEFAULT_PERSONAL_COLOR,
	getEventAttendance,
	listCalendars,
	listEventsInWindow,
	type CalendarRangedEvent
} from '$lib/domains/calendar/index.server';
import { dashboardVisibility, type DashboardVisibility } from '$lib/domains/dashboardModules';
import {
	getDashboardVisibility,
	type DashboardModulesVisibilityCtx
} from '$lib/domains/dashboardModules/index.server';
import { listGroceryItems } from '$lib/domains/groceries/index.server';
import {
	getCalendarPreferences,
	getCalendarSettings,
	getTimeZone,
	type IdentityCtx
} from '$lib/domains/identity/index.server';
import { listFamilyRoster, resolveMembershipFamilyId } from '$lib/domains/family/index.server';
import {
	listCompletionInstants,
	listDayCompletions,
	listFamilyTasks,
	listTaskCategories,
	listTasks,
	type TaskDayCompletion,
	type TaskListRow,
	type TaskSectionRow
} from '$lib/domains/tasks/index.server';
import { computeWeeklyStreak, mergeDayCompletions, rankTasks } from '$lib/domains/tasks';
import type {
	DashboardCompletedRow,
	DashboardData,
	DashboardDayEventRow,
	DashboardFamilyTaskRow,
	DashboardGroceryRow,
	DashboardKidsEventRow,
	DashboardLoadedData,
	DashboardPageData,
	DashboardRosterRow,
	DashboardTaskCategoryRow,
	DashboardUserTaskRow
} from './dayDashboard.contract';

/** What the load was asked for: the raw `?date=` value and the page's started reads. */
export type DayDashboardInput = {
	/** `?date=YYYY-MM-DD` in the viewer's zone; absent (or impossible) = today. */
	readonly date?: string | null;
	/**
	 * The viewer's category read, started by the page BEFORE `parent()` so the
	 * two overlap (legacy #283). Absent, the service starts it itself.
	 */
	readonly categoriesP?: Promise<DashboardTaskCategoryRow[]>;
	/** The layout's roster, when the page already has it; absent, the service reads it. */
	readonly familyMembers?: readonly DashboardRosterRow[] | null;
};

/** One leg's outcome: its value and the label to name when it failed. */
type Leg<T> = { readonly value: T; readonly warning: string | null };

/** One day's events, split by which calendar painted them. */
type DayEventLeg = {
	readonly dayEvents: DashboardDayEventRow[];
	readonly familyDayEvents: DashboardDayEventRow[];
};

/** The two grocery legs, in the card's order. */
type GroceryLeg = {
	readonly family: DashboardGroceryRow[];
	readonly mine: DashboardGroceryRow[];
};

/** The family leg: the roster plus the Kids' Schedule it feeds. */
type FamilyLeg = {
	readonly familyMembers: DashboardRosterRow[];
	readonly kidsSchedule: DashboardKidsEventRow[];
};

/**
 * Run one leg; a failure degrades to `fallback` and records `label`. The error
 * is logged, never thrown: the dashboard must not 500 over one card.
 */
async function runLeg<T>(
	ctx: Ctx,
	label: string,
	work: () => Promise<T>,
	fallback: T
): Promise<Leg<T>> {
	try {
		return { value: await work(), warning: null };
	} catch (error) {
		ctx.log.error('day_dashboard_leg_failed', {
			label,
			message: error instanceof Error ? error.message : String(error)
		});
		return { value: fallback, warning: label };
	}
}

/**
 * A day event's two presentation fields: the viewer's stored colour for their
 * own calendar (else the salmon default), the family tint for the family's,
 * exactly as the legacy loader painted them (Q-094's recorded default keeps the
 * family tint hard-coded).
 */
type DayEventPaint = { readonly color: string; readonly source: 'own' | 'family' };

/**
 * One occurrence as the dashboard wire carries it: the legacy projection drops
 * the ranged read's `creatorName` (the dashboard never showed who created an
 * event) and adds the paint the glance rows read.
 */
function toDayEventRow(event: CalendarRangedEvent, paint: DayEventPaint): DashboardDayEventRow {
	const { creatorName: _creatorName, ...rest } = event;
	return { ...rest, color: paint.color, source: paint.source };
}

/**
 * The two `mode:'date'` instants as ISO strings, which is what the wire carries
 * (Postgres's `timestamptz mode:'string'` columns keep their own render, so only
 * these two are rewritten).
 */
function taskInstants(row: { readonly createdAt: Date; readonly focusStartedAt: Date | null }) {
	return {
		createdAt: row.createdAt.toISOString(),
		focusStartedAt: row.focusStartedAt ? row.focusStartedAt.toISOString() : null
	};
}

/** One Task row as the wire carries it: the phone-focus overlay is the tasks list's, not this payload's. */
function toUserTaskRow(row: TaskListRow): DashboardUserTaskRow {
	const { phoneFocusMinutes: _minutes, phoneFocusStartedAt: _started, ...rest } = row;
	return { ...rest, ...taskInstants(rest), tags: [...rest.tags] };
}

/** One board row: the same fields, minus the event attribution the board never shows. */
function toFamilyTaskRow(row: TaskSectionRow): DashboardFamilyTaskRow {
	return { ...row, ...taskInstants(row), tags: [...row.tags] };
}

/** The two grocery legs' rows, projected to the two fields the card reads. */
function toGroceryRows(
	rows: readonly { readonly name: string; readonly stores: readonly string[] }[]
): DashboardGroceryRow[] {
	return rows.map((row) => ({ name: row.name, stores: [...row.stores] }));
}

/**
 * The viewer's effective module visibility (one `dashboardVisibility` answer).
 * A failing read degrades to the member's own saved facts with no family
 * switches and records the `settings` label — never a dead page.
 */
async function loadVisibility(
	ctx: Ctx,
	actor: Actor,
	familyId: string | null
): Promise<{ visibility: DashboardVisibility; warning: string | null }> {
	try {
		const visibility = await getDashboardVisibility(ctx as DashboardModulesVisibilityCtx, actor, {
			// No family: no switch rows exist for the empty id, so every
			// family-scoped module keeps its default. One read either way (109).
			familyId: familyId ?? ''
		});
		return { visibility, warning: null };
	} catch (error) {
		ctx.log.error('day_dashboard_visibility_failed', {
			message: error instanceof Error ? error.message : String(error)
		});
		const settings = await getCalendarSettings(ctx as IdentityCtx, actor)
			.then((result) => result.settings)
			.catch(() => null);
		return {
			visibility: dashboardVisibility({ settings, familySwitches: {} }),
			warning: 'settings'
		};
	}
}

/** The family's roster, or the layout's copy when the page already read it. */
async function rosterFor(
	ctx: Ctx,
	actor: Actor,
	familyId: string | null,
	provided: readonly DashboardRosterRow[] | null | undefined
): Promise<readonly DashboardRosterRow[]> {
	if (provided) return provided;
	if (!familyId) return [];
	const { members } = await listFamilyRoster(ctx, actor, familyId);
	return members.map((member) => ({
		userId: member.userId,
		firstName: member.firstName,
		lastName: member.lastName,
		email: member.email,
		role: member.role,
		memberType: member.memberType
	}));
}

/** The viewed day in the viewer's zone, plus its end and `isToday`. */
function resolveViewedDay(
	now: Date,
	zone: string,
	date: string | null | undefined
): { dayStart: DateTime; dayStartIso: string; dayEnd: DateTime; isToday: boolean } {
	const zonedNow = DateTime.fromJSDate(now, { zone });
	let dayStart = zonedNow.startOf('day');
	if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
		const parsed = DateTime.fromISO(date, { zone });
		// A well-formed but impossible date (2026-02-31) is invalid here and
		// falls back to today, exactly as the legacy loader did.
		if (parsed.isValid) dayStart = parsed.startOf('day');
	}
	return {
		dayStart,
		dayStartIso: dayStart.toISO() ?? '',
		dayEnd: dayStart.endOf('day'),
		isToday: dayStart.hasSame(zonedNow, 'day')
	};
}

/**
 * Load the Day Dashboard for one viewer and one day: the header (zone, day,
 * `isToday`, family, modules, categories) plus the streamed ten legs and their
 * warning labels. The page and the API call this one function.
 */
export async function loadDayDashboard(
	ctx: Ctx,
	actor: Actor,
	input: DayDashboardInput = {}
): Promise<DashboardPageData> {
	const now = ctx.clock.now();
	const zone = (await getTimeZone(ctx, actor.id)) ?? 'UTC';
	const { dayStart, dayStartIso, dayEnd, isToday } = resolveViewedDay(now, zone, input.date);
	const dayStartJs = dayStart.toJSDate();
	const dayEndJs = dayEnd.toJSDate();

	const familyId = await resolveMembershipFamilyId(ctx, actor.id).catch(() => null);
	const { visibility, warning: settingsWarning } = await loadVisibility(ctx, actor, familyId);
	const { modules } = visibility;

	// The viewer's categories: started by the page before `parent()` when it
	// had one, otherwise here. Never fails the page (legacy `listCategoryOptions`).
	const categoriesP: Promise<DashboardTaskCategoryRow[]> =
		input.categoriesP ??
		listTaskCategories(ctx, actor)
			.then((rows) => rows.map((row) => ({ id: row.id, name: row.name })))
			.catch(() => []);

	const taskLeg = runLeg<{ userTasks: DashboardUserTaskRow[]; familyTasks: DashboardFamilyTaskRow[] }>(
		ctx,
		'tasks',
		async () => {
			const userTasks = (await listTasks(ctx, actor)).map(toUserTaskRow);
			const board =
				familyId && visibility.needs('familyTasks')
					? await listFamilyTasks(ctx, actor, { familyId })
					: null;
			// The board shows only open Tasks; completed ones vanish after a toggle.
			const familyTasks = (board?.familyTasks ?? [])
				.filter((row) => !row.completedAt && !row.archivedAt)
				.map(toFamilyTaskRow);
			return { userTasks, familyTasks };
		},
		{ userTasks: [], familyTasks: [] }
	);

	const eventLeg = runLeg<DayEventLeg>(
		ctx,
		'events',
		() =>
			loadDayEvents(ctx, actor, {
				dayStart: dayStartJs,
				zone,
				familyId,
				wantFamilyEvents: visibility.needs('familyDayEvents')
			}),
		{ dayEvents: [], familyDayEvents: [] }
	);

	const winsLeg = runLeg<TaskDayCompletion[]>(
		ctx,
		'task-wins',
		() =>
			listDayCompletions(ctx, actor, {
				startIso: dayStartIso,
				endIso: dayEnd.toISO() ?? ''
			}),
		[]
	);

	const streakLeg = runLeg<number>(
		ctx,
		'streak',
		async () =>
			computeWeeklyStreak(await listCompletionInstants(ctx, actor), now.toISOString()).current,
		0
	);

	const groceriesLeg = runLeg<GroceryLeg>(
		ctx,
		'groceries',
		async () => {
			if (!visibility.needs('groceries')) return { family: [], mine: [] };
			const mine = toGroceryRows(await listGroceryItems(ctx, actor, { scope: 'mine' }));
			const family = familyId
				? toGroceryRows(await listGroceryItems(ctx, actor, { scope: 'family' }))
				: [];
			return { family, mine };
		},
		{ family: [], mine: [] }
	);

	const data: Promise<DashboardLoadedData> = (async () => {
		const [tasks, events, wins, streak, groceries] = await Promise.all([
			taskLeg,
			eventLeg,
			winsLeg,
			streakLeg,
			groceriesLeg
		]);
		const { userTasks, familyTasks } = tasks.value;

		// The roster and the attendance join behind Kids' Schedule both hang off
		// the family leg, and they consume the events the leg above produced.
		const familyLeg = await runLeg<FamilyLeg>(
			ctx,
			'family',
			async () => {
				if (!familyId || !visibility.needs('familyRoster')) {
					return { familyMembers: [], kidsSchedule: [] };
				}
				const roster = await rosterFor(ctx, actor, familyId, input.familyMembers);
				const kidsSchedule = visibility.needs('kidsAttendance')
					? await loadKidsSchedule(ctx, actor, roster, events.value.familyDayEvents)
					: [];
				return { familyMembers: [...roster], kidsSchedule };
			},
			{ familyMembers: [], kidsSchedule: [] }
		);

		const top3 = rankTasks(userTasks, actor.id, { todayStart: dayStartIso, limit: 3 });
		const oneOffCompleted = userTasks
			.filter(
				(row) =>
					row.completedAt &&
					new Date(row.completedAt) >= dayStartJs &&
					new Date(row.completedAt) < dayEndJs
			)
			.map(
				(row): DashboardCompletedRow => ({
					id: row.id,
					title: row.title,
					completedAt: row.completedAt ? new Date(row.completedAt).toISOString() : null
				})
			);
		const completedToday = mergeDayCompletions(oneOffCompleted, wins.value);
		const openForDay = userTasks.filter(
			(row) => !row.completedAt && row.dueDate && new Date(row.dueDate) < dayEndJs
		).length;

		return {
			userTasks,
			familyTasks,
			familyMembers: familyLeg.value.familyMembers,
			dayEvents: events.value.dayEvents,
			top3,
			glance: {
				doneToday: completedToday.length,
				openToday: openForDay,
				weekStreak: streak.value
			},
			completedToday,
			kidsSchedule: familyLeg.value.kidsSchedule,
			familyGroceries: groceries.value.family,
			mineGroceries: groceries.value.mine,
			warnings: [
				tasks.warning,
				events.warning,
				wins.warning,
				streak.warning,
				familyLeg.warning
			].filter((label): label is string => label !== null)
		};
	})();

	return {
		zone,
		dayISO: dayStartIso,
		isToday,
		meId: actor.id,
		familyId,
		modules,
		taskCategories: await categoriesP,
		data,
		loadWarnings: settingsWarning ? [settingsWarning] : []
	};
}

/**
 * One day's events, split into the viewer's own (personal calendar) and the
 * family's, painted as the glance rows expect. The ranged read spans every
 * accessible calendar, so the split is by calendar id: events on shared
 * calendars that are neither the personal nor the family one are not part of
 * this page (legacy read only those two). The viewed day is the half-open
 * `[dayStart, next midnight)` — an event ending exactly at 00:00 stays out.
 */
async function loadDayEvents(
	ctx: Ctx,
	actor: Actor,
	input: {
		readonly dayStart: Date;
		readonly zone: string;
		readonly familyId: string | null;
		readonly wantFamilyEvents: boolean;
	}
): Promise<DayEventLeg> {
	const lo = input.dayStart.getTime();
	const hi = lo + 86_400_000;
	const dayIso = DateTime.fromJSDate(input.dayStart, { zone: input.zone }).toISODate() ?? '';
	const { events } = await listEventsInWindow(ctx, actor, { from: dayIso, to: dayIso });
	if (events.length === 0) return { dayEvents: [], familyDayEvents: [] };

	const { calendars } = await listCalendars(ctx, actor);
	const personalId = calendars.find((calendar) => calendar.kind === 'personal')?.id ?? null;
	const familyCalendarId = calendars.find((calendar) => calendar.kind === 'family')?.id ?? null;
	const preferences = await getCalendarPreferences(ctx, actor.id).catch(() => null);
	const personalColor = preferences?.color || CALENDAR_DEFAULT_PERSONAL_COLOR;

	const own: DashboardDayEventRow[] = [];
	const family: DashboardDayEventRow[] = [];
	for (const event of events) {
		const dateMs = new Date(event.date).getTime();
		if (Number.isNaN(dateMs) || dateMs < lo || dateMs >= hi) continue;
		const endMs = event.end === null ? null : new Date(event.end).getTime();
		// End is exclusive; a zero-length or end-less event at 00:00 does reach the day.
		if (endMs !== null && endMs <= lo && endMs !== dateMs) continue;
		if (personalId !== null && event.calendarId === personalId) {
			own.push(toDayEventRow(event, { color: personalColor, source: 'own' }));
		} else if (familyCalendarId !== null && event.calendarId === familyCalendarId) {
			if (input.wantFamilyEvents) {
				family.push(
					toDayEventRow(event, { color: CALENDAR_DEFAULT_FAMILY_COLOR, source: 'family' })
				);
			}
		}
	}
	return {
		// Legacy drew the viewer's own day first, then the family's (Q-094's default).
		dayEvents: [...own, ...family],
		familyDayEvents: family
	};
}

/**
 * Kids' Schedule: the family's day events with at least one Child attendee
 * (Member Type `child`) whose RSVP is not declined. The child's id rides along
 * so the card groups and colours per child (072). Attendance is stored per
 * master, so a series' occurrences share it; the read is per master event.
 */
async function loadKidsSchedule(
	ctx: Ctx,
	actor: Actor,
	roster: readonly DashboardRosterRow[],
	familyDayEvents: readonly DashboardDayEventRow[]
): Promise<DashboardKidsEventRow[]> {
	const children = roster.filter((member) => member.memberType === 'child');
	if (children.length === 0 || familyDayEvents.length === 0) return [];
	const childIds = new Set(children.map((child) => child.userId));
	const childName = new Map(
		children.map((child) => [child.userId, child.firstName.trim() || child.userId])
	);

	const masterIds = [...new Set(familyDayEvents.map((event) => event.masterId))];
	const kidsByMaster = new Map<string, string[]>();
	await Promise.all(
		masterIds.map(async (masterId) => {
			const { attendance } = await getEventAttendance(ctx, actor, masterId);
			const kids: string[] = [];
			for (const row of attendance) {
				if (!row.userId || !childIds.has(row.userId) || row.status === 'declined') continue;
				// Dedupe by userId so two children sharing a first name don't collapse.
				if (!kids.includes(row.userId)) kids.push(row.userId);
			}
			if (kids.length > 0) kidsByMaster.set(masterId, kids);
		})
	);

	return familyDayEvents
		.filter((event) => kidsByMaster.has(event.masterId))
		.map((event) => ({
			id: event.id,
			title: event.title,
			start: event.start,
			end: event.end,
			allDay: event.allDay,
			location: event.location ?? null,
			kids: (kidsByMaster.get(event.masterId) ?? []).map((userId) => ({
				id: userId,
				name: childName.get(userId) ?? userId
			}))
		}));
}

/** Re-exported for the HTTP module: the streamed payload's exact types. */
export type { DashboardData, DashboardPageData };
