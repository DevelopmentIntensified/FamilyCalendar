/**
 * Touch-target measurement.
 *
 * jsdom has no layout, so auditing "is this button 44px tall?" means reading
 * the same numbers the browser would derive: the Tailwind spacing scale, the
 * line box behind the font size, the border widths, and any explicit
 * h/min-h/w/min-w. Everything here is a Tailwind v3 default — 16px root, the
 * rem spacing scale, and `normal` line-height (≈1.2em for the system sans
 * stack) when a font-size utility sets no leading.
 *
 * The point is that an audit reads numbers instead of squinting at
 * `px-1.5 py-1 text-[11px]` and calling it "about 24px".
 */

/** WCAG 2.5.5 / Apple HIG minimum comfortable target, in px. */
export const MIN_TOUCH = 44;

/** Tailwind v3 default spacing scale, in rem. */
const SPACING_REM: Record<string, number> = {
	px: 0.0625,
	'0': 0,
	'0.5': 0.125,
	'1': 0.25,
	'1.5': 0.375,
	'2': 0.5,
	'2.5': 0.625,
	'3': 0.75,
	'3.5': 0.875,
	'4': 1,
	'5': 1.25,
	'6': 1.5,
	'7': 1.75,
	'8': 2,
	'9': 2.25,
	'10': 2.5,
	'11': 2.75,
	'12': 3
};

/** Font-size utilities, in px. */
const FONT_PX: Record<string, number> = {
	'text-[9px]': 9,
	'text-[10px]': 10,
	'text-[11px]': 11,
	'text-xs': 12,
	'text-sm': 14,
	'text-base': 16,
	'text-lg': 18
};

/** Unitless line-height multipliers; the absolute `leading-N` are px below. */
const LEADING_MULT: Record<string, number> = {
	'leading-none': 1,
	'leading-tight': 1.25,
	'leading-snug': 1.375,
	'leading-normal': 1.5
};

const LEADING_PX: Record<string, number> = { 'leading-3': 12, 'leading-4': 16, 'leading-5': 20 };

const BORDER_PX: Record<string, number> = { 'border-0': 0, border: 1, 'border-2': 2 };

/** Resolve a spacing token to px. Handles `1.5`, `11`, `px`, `[44px]`. */
function spacing(token: string): number | null {
	const arbitrary = token.match(/^\[(\d*\.?\d+)px\]$/);
	if (arbitrary) return Number(arbitrary[1]);
	return token in SPACING_REM ? SPACING_REM[token] * 16 : null;
}

/** First value a `<prefix>-*` token resolves to, or null. */
function sizeOf(classes: string[], prefix: string): number | null {
	for (const c of classes) {
		if (!c.startsWith(`${prefix}-`)) continue;
		const v = spacing(c.slice(prefix.length + 1));
		if (v !== null) return v;
	}
	return null;
}

/** Content line box for a class list; an explicit `leading-*` beats `normal`. */
function lineBox(classes: string[]): number {
	const font = classes.find((c) => c in FONT_PX);
	const size = font ? FONT_PX[font] : 16;
	for (const c of classes) {
		if (c in LEADING_PX) return LEADING_PX[c];
		if (c in LEADING_MULT) return Math.round(size * LEADING_MULT[c] * 100) / 100;
	}
	return Math.round(size * 1.2 * 100) / 100;
}

export interface Box {
	/** px, or null when nothing in the chain pins the width (intrinsic text). */
	width: number | null;
	/** Border-box height in px. */
	height: number;
}

/**
 * Border-box height of a control computed from its class chain the way the
 * browser would: an explicit `h-*` wins, then `min-h-*`, then the natural box
 * (line box + vertical padding + borders). Width is reported only when the
 * chain pins it, because intrinsic text width needs font metrics jsdom lacks.
 */
export function measureBox(className: string): Box {
	const classes = className.split(/\s+/).filter(Boolean);
	// py-* sets both edges, so it counts twice; pt/pb add on top. `border`
	// styles all four sides, so a 1px border costs 2px of border-box height.
	const padY =
		(sizeOf(classes, 'py') ?? 0) * 2 + (sizeOf(classes, 'pt') ?? 0) + (sizeOf(classes, 'pb') ?? 0);
	const borderY = classes.reduce((sum, c) => sum + (BORDER_PX[c] ?? 0), 0) * 2;
	const height = sizeOf(classes, 'min-h') ?? sizeOf(classes, 'h') ?? lineBox(classes) + padY + borderY;
	const width = sizeOf(classes, 'w') ?? sizeOf(classes, 'min-w');
	return { width, height };
}
