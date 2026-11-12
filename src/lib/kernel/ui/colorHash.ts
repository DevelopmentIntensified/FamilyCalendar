/**
 * Colour from a name or an id. Kernel ui; see [../README.md](../README.md).
 *
 * Two hashes on purpose (#115, 096):
 * - `nameColor` is THE name hash, the one the store-colour default and the
 *   contact-colour palette already take modulo their own palette. One copy, so
 *   two surfaces hatching a colour for the same name land on the same swatch.
 * - `idColor` is the avatar hash, a plain additive charCode sum. It is a
 *   deliberately different function: swapping it for the name hash would
 *   repaint every existing avatar.
 *
 * Neither is cryptographic and neither is meant to be: swatches over a small
 * palette, collisions permitted and disclosed, never prevented (096).
 */

/** The avatar swatches, in palette order. Private so callers use `idColor`. */
const AVATAR_COLOURS = [
	'bg-rose-100 text-rose-700',
	'bg-amber-100 text-amber-700',
	'bg-emerald-100 text-emerald-700',
	'bg-sky-100 text-sky-700',
	'bg-violet-100 text-violet-700',
	'bg-fuchsia-100 text-fuchsia-700',
	'bg-lime-100 text-lime-700',
	'bg-orange-100 text-orange-700'
];

/**
 * The name hash: a charCode sum with `hash << 5` mixing. `<<` truncates to
 * int32 on every step, which is part of today's pinned output — do not
 * "improve" it without repainting every store and contact.
 */
function nameHash(name: string): number {
	let hash = 0;
	for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
	return hash;
}

/**
 * The name's colour hash, always non-negative: take it modulo your palette
 * length. Both name-derived palettes (store colours, contact colours) already
 * do exactly that, so the same name keeps its swatch everywhere.
 */
export function nameColor(name: string): number {
	return Math.abs(nameHash(name));
}

/** The avatar colour for an id: one of the eight `bg-…-100 text-…-700` pairs. */
export function idColor(id: string): string {
	let hash = 0;
	for (let i = 0; i < id.length; i++) hash += id.charCodeAt(i);
	// SAFETY: `hash % length` is always a valid index into the palette.
	return AVATAR_COLOURS[hash % AVATAR_COLOURS.length]!;
}

/**
 * The initials a person's avatar shows. Legacy shape kept on purpose: with a
 * last name it is `first[0] + last[0]` as typed (no re-capitalising); without
 * one it is the first letter upper-cased. Missing names are empty strings, so
 * a person with only a last name still gets `R`.
 */
export function initials(
	first: string | null | undefined,
	last: string | null | undefined
): string {
	const firstPart = first ?? '';
	const lastPart = last ?? '';
	if (lastPart) return `${firstPart.charAt(0)}${lastPart.charAt(0)}`;
	return firstPart.charAt(0).toUpperCase();
}
