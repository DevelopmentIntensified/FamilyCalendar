/**
 * 131 — the property rules of the design-conformance harness.
 *
 * One rule per tracked property: a normaliser that turns what getComputedStyle
 * reports into one canonical spelling, so a deviation is a difference in the
 * design and never a difference in notation. The values themselves are never
 * written down here — they are derived per run from what the marketing pages
 * emit (see tokens.ts).
 */

/** The properties measured on every element of every route. */
export const PROPERTIES: string[] = [
	'border-radius',
	'background-color',
	'color',
	'border-top-color',
	'border-right-color',
	'border-bottom-color',
	'border-left-color',
	'letter-spacing',
	'font-size',
	'font-weight',
	'text-transform',
	'box-shadow',
	'padding-top',
	'padding-right',
	'padding-bottom',
	'padding-left',
	'row-gap',
	'column-gap',
	'border-top-width',
	'border-right-width',
	'border-bottom-width',
	'border-left-width'
];

export type Normaliser = (value: string) => string;

const collapse: Normaliser = (value) => value.trim().replace(/\s+/g, ' ');

const hex2 = (n: number): string => n.toString(16).padStart(2, '0');

const channel = (raw: string): number => {
	const n = raw.endsWith('%') ? (parseFloat(raw) / 100) * 255 : parseFloat(raw);
	return Math.round(n);
};

const alphaOf = (raw: string): number => {
	const n = raw.endsWith('%') ? parseFloat(raw) / 100 : parseFloat(raw);
	return Math.min(1, Math.max(0, n));
};

/**
 * Canonical colour: hex for every channel spelling Chromium reports (rgb/rgba
 * comma and slash syntax, color(srgb ...) from color-mix, #hex), alpha folded
 * into two hex digits, fully transparent collapsed to one token. Anything it
 * cannot parse passes through collapsed rather than guessed at.
 */
export const normaliseColor: Normaliser = (value) => {
	const v = value.trim().toLowerCase();

	const fromChannels = (channels: string[], alpha?: string): string | null => {
		if (channels.length < 3) return null;
		const r = channel(channels[0]);
		const g = channel(channels[1]);
		const b = channel(channels[2]);
		if (![r, g, b].every(Number.isFinite)) return null;
		const a = alpha !== undefined ? alphaOf(alpha) : channels.length > 3 ? alphaOf(channels[3]) : 1;
		if (a <= 0) return 'transparent';
		const base = `#${hex2(r)}${hex2(g)}${hex2(b)}`;
		return a >= 1 ? base : base + hex2(Math.round(a * 255));
	};

	const rgb = v.match(/^rgba?\(([^)]+)\)$/);
	if (rgb) {
		const [channelsPart, alphaPart] = rgb[1].split('/');
		const channels = channelsPart
			.trim()
			.split(/[\s,]+/)
			.filter(Boolean);
		const canonical = fromChannels(channels, alphaPart?.trim());
		if (canonical) return canonical;
	}

	const srgb = v.match(/^color\(srgb\s+([^)]+)\)$/);
	if (srgb) {
		const [channelsPart, alphaPart] = srgb[1].split('/');
		const channels = channelsPart
			.trim()
			.split(/\s+/)
			.filter(Boolean)
			.map((n) => String(Math.round(parseFloat(n) * 255)));
		const canonical = fromChannels(channels, alphaPart?.trim());
		if (canonical) return canonical;
	}

	if (/^#[0-9a-f]{3}$/.test(v)) {
		return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
	}
	if (/^#[0-9a-f]{6}$/.test(v) || /^#[0-9a-f]{8}$/.test(v)) return v;

	return collapse(value);
};

/** Lengths keep the unit the engine reported — the measurement is the point. */
export const normaliseLength: Normaliser = collapse;

export const normaliseKeyword: Normaliser = (value) => collapse(value).toLowerCase();

/** Shadows: collapse the notation, then canonicalise every colour inside. */
const SHADOW_COLOUR = /(rgba?\([^)]*\)|color\(srgb[^)]*\)|#[0-9a-fA-F]{3,8})/g;

export const normaliseShadow: Normaliser = (value) =>
	collapse(value).replace(SHADOW_COLOUR, (match) => normaliseColor(match));

const COLOR_PROPERTIES = new Set([
	'background-color',
	'color',
	'border-top-color',
	'border-right-color',
	'border-bottom-color',
	'border-left-color'
]);

const LENGTH_PROPERTIES = new Set([
	'border-radius',
	'letter-spacing',
	'font-size',
	'padding-top',
	'padding-right',
	'padding-bottom',
	'padding-left',
	'row-gap',
	'column-gap',
	'border-top-width',
	'border-right-width',
	'border-bottom-width',
	'border-left-width'
]);

const KEYWORD_PROPERTIES = new Set(['font-weight', 'text-transform']);

const ruleFor = (property: string): Normaliser => {
	if (COLOR_PROPERTIES.has(property)) return normaliseColor;
	if (LENGTH_PROPERTIES.has(property)) return normaliseLength;
	if (KEYWORD_PROPERTIES.has(property)) return normaliseKeyword;
	return normaliseShadow; // box-shadow is the only remaining property
};

/** One normaliser per tracked property. */
export const RULES: Record<string, Normaliser> = Object.fromEntries(
	PROPERTIES.map((property) => [property, ruleFor(property)])
);
