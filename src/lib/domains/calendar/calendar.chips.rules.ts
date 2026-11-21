/**
 * The one chip vocabulary every calendar view speaks (#068), plus the day
 * split/group the month views need. Ported from `chipVocabulary.ts`,
 * `eventChip.ts`, `eventDisplay.ts` and `shareTarget.ts`.
 *
 * The rule that makes it decodable cold: **shape carries the kind, colour
 * carries the calendar.** Four kinds — `timed` (dot), `allDay` (bar), `task`
 * (ring), `sponsored` (hatched bag). Nothing keys off a hue, and no kind paints
 * a background fill.
 *
 * Doc: ./README.md#invariants
 */
import { DateTime } from 'luxon';
import { groupByDay } from '$lib/kernel/time/dates';

export type ChipKind = 'timed' | 'allDay' | 'task' | 'sponsored';

/** The closed vocabulary, in reading order. */
export const CHIP_KINDS = ['timed', 'allDay', 'task', 'sponsored'] as const;

/** The kind's word and hidden phrase; a sponsored chip is an "Ad". */
export const SPONSORED_LABEL = 'Ad';
export const SPONSORED_A11Y = 'Sponsored';

/** Every glyph is drawn in this box, so mixed rows keep one baseline. */
export const CHIP_GLYPH_PX = 10;
export const CHIP_GAP_PX = 2;
export const CHIP_RAIL_PX = 3;

/** Usable width inside one month-cell chip at the narrowest viewport (320px). */
export const MONTH_CELL_CHIP_PX = (320 - 16) / 7 - 4 - 4 - 8;

export type ChipDensity = 'glyph' | 'word';

export interface ChipGlyph {
	readonly name: 'dot' | 'bar' | 'ring' | 'bag';
	readonly box: number;
	readonly width: number;
	readonly height: number;
	readonly radius: string;
	/** Stroke width for outlined glyphs; 0 when filled. */
	readonly stroke: number;
}

export interface ChipTreatment {
	readonly kind: ChipKind;
	readonly glyph: ChipGlyph;
	/** The kind's word, for views with room for it. */
	readonly word: string;
	/** Announced when a glyph view drops the word. Empty for `timed`. */
	readonly a11y: string;
	readonly containerClass: string;
	readonly glyphClass: string;
	readonly wordClass: string;
}

const px = CHIP_GLYPH_PX;

/** Neutral hatch: sponsored is told apart by texture, not a second colour. */
const HATCH =
	'repeating-linear-gradient(135deg, rgba(15,23,42,0.10) 0 2px, rgba(0,0,0,0) 2px 6px)';

const RAIL = `border-l-[${CHIP_RAIL_PX}px] border-l-[var(--chip-color)]`;

const WORD = 'shrink-0 text-[9px] font-semibold uppercase leading-none tracking-wide opacity-70';

const TREATMENTS: Readonly<Record<ChipKind, ChipTreatment>> = {
	timed: {
		kind: 'timed',
		glyph: {
			name: 'dot',
			box: px,
			width: Math.round(px * 0.6),
			height: Math.round(px * 0.6),
			radius: '9999px',
			stroke: 0
		},
		word: '',
		a11y: '',
		containerClass: RAIL,
		glyphClass: 'text-[var(--chip-color)]',
		wordClass: WORD
	},
	allDay: {
		kind: 'allDay',
		glyph: { name: 'bar', box: px, width: px, height: Math.round(px * 0.5), radius: '1px', stroke: 0 },
		word: 'All day',
		a11y: 'All day',
		containerClass: RAIL,
		glyphClass: 'text-[var(--chip-color)]',
		wordClass: WORD
	},
	task: {
		kind: 'task',
		glyph: {
			name: 'ring',
			box: px,
			width: Math.round(px * 0.9),
			height: Math.round(px * 0.9),
			radius: '9999px',
			stroke: 2
		},
		word: 'Task',
		a11y: 'Task',
		containerClass: 'border border-dashed border-slate-300',
		glyphClass: 'text-slate-400',
		wordClass: `${WORD} text-slate-500 opacity-100`
	},
	sponsored: {
		kind: 'sponsored',
		glyph: {
			name: 'bag',
			box: px,
			width: Math.round(px * 0.9),
			height: Math.round(px * 0.9),
			radius: '0px',
			stroke: 0
		},
		word: SPONSORED_LABEL,
		a11y: SPONSORED_A11Y,
		containerClass: `border border-[var(--chip-color)] ${RAIL}`,
		glyphClass: 'text-[var(--chip-color)]',
		wordClass: `${WORD} text-slate-600 opacity-100`
	}
};

/** Which treatment an event wears. An ad outranks all-day. */
export function chipKind(event: { allDay?: boolean | null; isAd?: boolean | null }): ChipKind {
	if (event.isAd) return 'sponsored';
	return event.allDay ? 'allDay' : 'timed';
}

export function chipTreatment(kind: ChipKind): ChipTreatment {
	return TREATMENTS[kind];
}

/** The word a view shows, or '' when the view is a glyph view. */
export function chipWord(kind: ChipKind, density: ChipDensity): string {
	return density === 'word' ? TREATMENTS[kind].word : '';
}

/** The hidden phrase a glyph view falls back to, or '' when the word shows. */
export function chipA11y(kind: ChipKind, density: ChipDensity): string {
	return density === 'word' ? '' : TREATMENTS[kind].a11y;
}

/** The calendar colour, with the legacy neutral when the event has none. */
export function chipColor(event: { color?: string | null }): string {
	return event.color || '#94a3b8';
}

export type CalendarRef = { readonly id: string; readonly name: string };

/** The calendar an event belongs to, or '' when ambiguous/unneeded. */
export function calendarNameFor(
	event: { calendarId?: string | null },
	calendars: readonly CalendarRef[]
): string {
	if (calendars.length < 2) return '';
	return calendars.find((calendar) => calendar.id === event.calendarId)?.name || '';
}

/** Hover/hint text attributing an event to its calendar. */
export function chipTooltip(
	event: { title?: string; calendarId?: string | null },
	calendars: readonly CalendarRef[]
): string {
	const title = event.title ?? '';
	const name = calendarNameFor(event, calendars);
	return name ? `${title} · ${name}` : title;
}

/**
 * The chip's inline style: the calendar colour as a variable, plus the hatch
 * for a sponsored chip. No background fill for any kind — colour stays free to
 * mean "which calendar".
 */
export function chipSurfaceStyle(event: {
	color?: string | null;
	allDay?: boolean | null;
	isAd?: boolean | null;
}): string {
	const color = chipColor({ color: event.color ?? undefined });
	return chipKind(event) === 'sponsored'
		? `--chip-color:${color};background-image:${HATCH};`
		: `--chip-color:${color};`;
}

export interface ChipShell {
	readonly kind: ChipKind;
	readonly markDensity: ChipDensity;
	readonly treatment: ChipTreatment;
	/** The treatment's classes, with an overdue task's red border swapped in. */
	readonly containerClass: string;
	/** The calendar-coloured inline style ('' for task chips). */
	readonly style: string;
	/** The visible word when the density allows one ('' otherwise). */
	readonly word: string;
	/** Hover/sr text for a glyph view ('' in a word view). */
	readonly tooltip: string;
}

export type ChipShellInput =
	| {
			readonly density: ChipDensity;
			readonly event: {
				readonly title?: string;
				readonly calendarId?: string | null;
				readonly color?: string | null;
				readonly allDay?: boolean | null;
				readonly isAd?: boolean | null;
			};
			/** Calendar list for attribution on the hover hint (#067). */
			readonly calendars?: readonly CalendarRef[];
	  }
	| { readonly density: ChipDensity; readonly kind: 'task'; readonly overdue?: boolean };

/**
 * The one chip recipe every view imports (#111). An EVENT chip is described by
 * `event` (the shell derives the kind itself, so a hand-computed kind can
 * never desync from the style); a TASK chip by `kind: 'task'`.
 */
export function describeEventChip(input: ChipShellInput): ChipShell {
	if ('kind' in input) {
		const taskTreatment = chipTreatment('task');
		return {
			kind: 'task',
			markDensity: input.density,
			treatment: taskTreatment,
			containerClass: input.overdue
				? taskTreatment.containerClass.replace('border-slate-300', 'border-red-400')
				: taskTreatment.containerClass,
			style: '',
			word: chipWord('task', input.density),
			tooltip: ''
		};
	}
	const kind = chipKind(input.event);
	const treatment = chipTreatment(kind);
	const attributed = chipTooltip(input.event, input.calendars ?? []);
	const hidden = chipA11y(kind, 'glyph');
	return {
		kind,
		markDensity: input.density,
		treatment,
		containerClass: treatment.containerClass,
		style: chipSurfaceStyle(input.event),
		word: chipWord(kind, input.density),
		// #067: a glyph view spells the kind on the hover hint — the same phrase
		// the mark gives a screen reader, prefixed onto the calendar-attributed title.
		tooltip: input.density === 'glyph' ? (hidden && attributed ? `${hidden} · ${attributed}` : attributed) : ''
	};
}

/** Minimal row shape the day split needs: start/end as Date or ISO string. */
interface EventLike {
	readonly start: Date | string | number;
	readonly end?: Date | string | number | null;
}

export type ParsedDay<T> = T & { readonly start: Date; readonly end: Date | null; readonly date: Date };

/**
 * Split events that span several calendar days into one entry per day, each
 * carrying its own `date`. Single-day events pass through untouched. #224:
 * count local midnights crossed, not rounded 24-hour blocks.
 */
export function splitEventsByDay<T extends EventLike>(
	eventsData: readonly T[],
	zone?: string
): ParsedDay<T>[] {
	return eventsData.flatMap((event): ParsedDay<T>[] => {
		const startDate = new Date(event.start);
		const endDate = event.end ? new Date(event.end) : null;

		const start = DateTime.fromJSDate(startDate, { zone });
		const end = endDate ? DateTime.fromJSDate(endDate, { zone }) : null;

		if (!end || start.hasSame(end, 'day')) {
			return [Object.assign({}, event, { start: startDate, end: endDate, date: startDate })];
		}

		const diffDays = Math.round(
			Math.abs(end.startOf('day').diff(start.startOf('day'), 'days').days)
		);
		const days: ParsedDay<T>[] = [];
		for (let index = 0; index <= diffDays; index++) {
			const date = start.plus({ days: index }).toJSDate();
			days.push(Object.assign({}, event, { start: date, end: endDate, date }));
		}
		return days;
	});
}

/**
 * Bucket the day-split entries by their day key in `zone` in one pass. Uses
 * kernel/time's `groupByDay`, so there is no second grouping rule.
 */
export function groupEventsByDay<T extends EventLike>(
	eventsData: readonly T[],
	zone: string
): Map<string, ParsedDay<T>[]> {
	return groupByDay(splitEventsByDay(eventsData, zone), (entry) => entry.date, zone);
}

/**
 * Issue 027: the PWA share target lands with `title`, `text` and `url`. On
 * Android `url` is empty and the URL rides inside `text`, so never duplicate a
 * URL already present; collapse newlines into spaces for the single-line
 * Quick Add input.
 */
export function buildSharedTargetText(title: string, text: string, url: string): string {
	const trimmedText = text.trim();
	const trimmedUrl = url.trim();
	let base = trimmedText || title.trim();
	if (trimmedUrl && !(text ?? '').includes(trimmedUrl)) {
		base = base ? `${base} ${trimmedUrl}` : trimmedUrl;
	}
	return base.replace(/\s+/g, ' ').trim();
}
