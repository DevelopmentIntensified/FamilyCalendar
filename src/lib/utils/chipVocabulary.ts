import { chipColor } from './eventChip';

/**
 * The one chip vocabulary every calendar view speaks (#068).
 *
 * Four kinds, four treatments: `timed`, `allDay`, `task`, `sponsored`.
 *
 * The rule that makes it decodable cold: **shape carries the kind, colour
 * carries the calendar.** Nothing in this module keys off a hue, so an all-day
 * event stops being a translucent fill and the fill stops carrying meaning —
 * an all-day event is a bar, a timed event is a dot, and both wear the same
 * rail in their calendar's colour.
 */
export type ChipKind = 'timed' | 'allDay' | 'task' | 'sponsored';

/** The closed vocabulary, in reading order. 070's key enumerates exactly this. */
export const KINDS: readonly ChipKind[] = ['timed', 'allDay', 'task', 'sponsored'];

/** Every glyph is drawn in this box, so a row of mixed chips keeps one
 *  baseline — the kind must read from the shape, never from a size jump. */
export const CHIP_GLYPH_PX = 10;

/** Gap between a chip's mark and its label. */
export const CHIP_GAP_PX = 2;

/** Calendar-coloured rail on every event chip. */
export const CHIP_RAIL_PX = 3;

/**
 * Usable width inside one month-cell chip at the narrowest supported viewport
 * (320px), derived from the real padding chain rather than eyeballed:
 *
 *   320  viewport
 * -  16  Calendar.svelte      px-2
 * = 304  month grid
 * /  7  MonthView             grid-cols-7, no gap below sm
 * -   4  MonthDayCell         p-0.5
 * -   4  MonthDayCell         chips row px-0.5
 * -   8  chip                 px-1
 * = ~27.4px
 *
 * That leaves ~15px of title once the 10px mark and 2px gap are in — not even
 * three characters — which is why the month cell is a **glyph** view.
 */
export const MONTH_CELL_CHIP_PX = (320 - 16) / 7 - 4 - 4 - 8;

/** Whether a view's chip has room for the kind's word, or only its glyph. */
export type ChipDensity = 'glyph' | 'word';

export type ChipGlyph = {
	name: 'dot' | 'bar' | 'ring' | 'bag';
	/** The box every glyph shares. */
	box: number;
	width: number;
	height: number;
	radius: string;
	/** Stroke width for outlined glyphs; 0 when filled. */
	stroke: number;
};

export type ChipTreatment = {
	kind: ChipKind;
	glyph: ChipGlyph;
	/** The kind's word, for views with room for it. */
	word: string;
	/** Announced when a glyph view drops the word. Empty for `timed`, which
	 *  the grid's own y-position already says. */
	a11y: string;
	/** Shape only — never a hue, and never a background fill. */
	containerClass: string;
	glyphClass: string;
	wordClass: string;
};

const px = CHIP_GLYPH_PX;

/** Neutral hatch: sponsored is told apart by texture, so the texture must not
 *  repaint the chip and colour stays free to mean "which calendar". */
const HATCH = 'repeating-linear-gradient(135deg, rgba(15,23,42,0.10) 0 2px, rgba(0,0,0,0) 2px 6px)';

const RAIL = `border-l-[${CHIP_RAIL_PX}px] border-l-[var(--chip-color)]`;

const WORD = 'shrink-0 text-[9px] font-semibold uppercase leading-none tracking-wide opacity-70';

const TREATMENTS: Record<ChipKind, ChipTreatment> = {
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
		glyph: {
			name: 'bar',
			box: px,
			width: px,
			height: Math.round(px * 0.5),
			radius: '1px',
			stroke: 0
		},
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
		word: 'Ad',
		a11y: 'Sponsored',
		containerClass: `border border-[var(--chip-color)] ${RAIL}`,
		glyphClass: 'text-[var(--chip-color)]',
		wordClass: `${WORD} text-slate-600 opacity-100`
	}
};

/** Which of the four treatments an event wears. An ad outranks all-day: an
 *  all-day sponsored event is still an ad, and 067 labels it as one.
 *  Nullish-tolerant: a serialized or legacy row may carry no `allDay` at all. */
export function chipKindOf(event: { allDay?: boolean | null; isAd?: boolean | null }): ChipKind {
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

/** The hidden phrase a glyph view falls back to, or '' when the word is shown. */
export function chipA11y(kind: ChipKind, density: ChipDensity): string {
	return density === 'word' ? '' : TREATMENTS[kind].a11y;
}

/**
 * The chip's inline style: the calendar colour as a variable, plus the hatch
 * for a sponsored chip. No background fill for any kind — the all-day tint is
 * gone, so the fill stops carrying the meaning.
 */
export function chipSurfaceStyle(event: {
	color?: string | null;
	allDay?: boolean | null;
	isAd?: boolean | null;
}): string {
	const color = chipColor({ color: event.color ?? undefined });
	const kind = chipKindOf(event);
	return kind === 'sponsored'
		? `--chip-color:${color};background-image:${HATCH};`
		: `--chip-color:${color};`;
}
