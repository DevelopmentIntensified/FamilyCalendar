/**
 * The family palette — one declaration, read by everyone who needs to know
 * what a family's colour can be.
 *
 * Before issue 099 the default was written out twice: once as the swatch state
 * in the create page and once as the create action's fallback. The two could
 * drift apart silently, and a crafted form post with no colour field got the
 * action's copy rather than the one the page offered. The default is now
 * `FAMILY_PALETTE[0]`, so it cannot disagree with what the page shows.
 *
 * The set is the approved prototype's curated earthy six
 * (prototypes/app-ui/family-create.html), not a rainbow grid. It replaced the
 * old default rather than joining it: `#3B82F6` is retired, and
 * `RETIRED_FAMILY_COLOR` exists so the decision is asserted rather than
 * forgotten.
 */
export interface FamilyColor {
	/** Plain-word name shown to the user — the swatch is never colour alone. */
	name: string;
	value: string;
}

export const FAMILY_PALETTE: readonly FamilyColor[] = [
	{ name: 'Terracotta', value: '#c45e38' },
	{ name: 'Sand', value: '#d38248' },
	{ name: 'Sage', value: '#4d9c85' },
	{ name: 'Slate blue', value: '#5b9fb5' },
	{ name: 'Plum', value: '#8d7aa8' },
	{ name: 'Umber', value: '#b45309' }
];

/** The colour a new family gets when the request carries none. */
export const DEFAULT_FAMILY_COLOR = FAMILY_PALETTE[0].value;

/** The pre-099 default. Not a member of the palette; kept only to pin the swap. */
export const RETIRED_FAMILY_COLOR = '#3B82F6';

/**
 * Whether a value is a colour this product offers. The column is free text, so
 * this is the guard on the way in: an exact, case-sensitive membership test, so
 * what is stored is always exactly what the page declared.
 */
export function isFamilyColor(value: string | null | undefined): value is string {
	return FAMILY_PALETTE.some((colour) => colour.value === value);
}
