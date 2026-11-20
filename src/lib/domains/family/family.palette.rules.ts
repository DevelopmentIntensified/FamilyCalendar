/**
 * family palette rules: the one declaration of what a family's colour can be,
 * read by everyone who needs to know (the create guard, the picker, the
 * default).
 *
 * Before issue 099 the default was written out twice (the swatch state and the
 * create action's fallback) and the two could drift apart silently, so the
 * default is `FAMILY_PALETTE[0]`. The set is the approved prototype's curated
 * earthy six (prototypes/app-ui/family-create.html), not a rainbow grid. It
 * replaced the old default rather than joining it: `#3B82F6` is retired, and
 * `RETIRED_FAMILY_COLOR` exists so the decision is asserted rather than
 * forgotten.
 *
 * Two colour rules coexist on purpose (owner question Q-025, answered A:
 * keep): create accepts only a palette value (`isFamilyColor`), while
 * `PATCH /api/families/{id}` accepts any `#rrggbb` (`isHexColor`), because
 * installed clients may send stored custom colours.
 *
 * Doc: ./README.md#invariants
 */

/** A swatch: the plain-word name is shown beside it, so colour is never the only cue. */
export type FamilyColor = {
	readonly name: string;
	readonly value: string;
};

export const FAMILY_PALETTE = [
	{ name: 'Terracotta', value: '#c45e38' },
	{ name: 'Sand', value: '#d38248' },
	{ name: 'Sage', value: '#4d9c85' },
	{ name: 'Slate blue', value: '#5b9fb5' },
	{ name: 'Plum', value: '#8d7aa8' },
	{ name: 'Umber', value: '#b45309' }
] as const satisfies readonly FamilyColor[];

/** The colour a new family gets when the request carries none. */
export const DEFAULT_FAMILY_COLOR: string = FAMILY_PALETTE[0].value;

/** The pre-099 default. Not a palette member; kept only to pin the swap. */
export const RETIRED_FAMILY_COLOR = '#3B82F6';

/**
 * Whether a value is a colour this product offers. The column is free text, so
 * this is the guard on the way in: an exact, case-sensitive membership test, so
 * what is stored is always exactly what the page declared.
 */
export function isFamilyColor(value: string | null | undefined): value is string {
	return FAMILY_PALETTE.some((colour) => colour.value === value);
}

/** The shape the PATCH door accepts (Q-025): any six-digit hex, either case. */
export function isHexColor(value: string): boolean {
	return /^#[0-9a-fA-F]{6}$/.test(value);
}
