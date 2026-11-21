import { RULES } from './rules';

/**
 * 131 — the design-conformance harness core.
 *
 * A Measurement is one emitted value taken from a real browser: which element,
 * which property, what getComputedStyle reported. A TokenSet is the design
 * language derived from the marketing pages' own measurements — the reference
 * is observed, never hand-written, so there is no second style guide to drift.
 *
 * Every later audit ticket plugs in here: derive once from the marketing
 * corpus, measure the route under audit, assert on findDeviations.
 */

export interface Measurement {
	selector: string;
	property: string;
	value: string;
}

/** property -> every value the reference emitted for it, normalised. */
export type TokenSet = Record<string, string[]>;

export interface Deviation {
	selector: string;
	property: string;
	expected: string[];
	actual: string;
}

const numericFirst = (a: string, b: string): number => {
	const na = parseFloat(a);
	const nb = parseFloat(b);
	const aNum = Number.isFinite(na);
	const bNum = Number.isFinite(nb);
	if (aNum && bNum) return na - nb || a.localeCompare(b);
	if (aNum) return -1;
	if (bNum) return 1;
	return a.localeCompare(b);
};

/** Derive the token set from what the reference pages actually emitted. */
export function deriveTokens(pages: Measurement[][]) {
	const observed = new Map<string, Set<string>>();
	for (const page of pages) {
		for (const measurement of page) {
			const rule = RULES[measurement.property];
			if (!rule) continue;
			let values = observed.get(measurement.property);
			if (!values) observed.set(measurement.property, (values = new Set()));
			values.add(rule(measurement.value));
		}
	}
	const tokens: TokenSet = {};
	for (const [property, values] of observed) {
		tokens[property] = [...values].sort(numericFirst);
	}
	return tokens;
}

/**
 * Compare a measured route against the derived token set. A property the
 * reference never emitted carries no opinion and is skipped — silence is not a
 * pass, it is an absence of a reference.
 */
export function findDeviations(measurements: Measurement[], tokens: TokenSet): Deviation[] {
	const deviations: Deviation[] = [];
	for (const measurement of measurements) {
		const rule = RULES[measurement.property];
		if (!rule) continue;
		const expected = tokens[measurement.property];
		if (!expected || expected.length === 0) continue;
		const actual = rule(measurement.value);
		if (!expected.includes(actual)) {
			deviations.push({
				selector: measurement.selector,
				property: measurement.property,
				expected,
				actual
			});
		}
	}
	return deviations;
}

/** One line per finding: selector, property, expected values, actual value. */
export function formatDeviations(deviations: Deviation[], maxExpected = 8): string {
	return deviations
		.map((deviation) => {
			const shown = deviation.expected.slice(0, maxExpected).join(', ');
			const rest = deviation.expected.length - maxExpected;
			const more = rest > 0 ? ` (+${rest} more)` : '';
			return `- ${deviation.selector} | ${deviation.property} | expected ${shown}${more} | actual ${deviation.actual}`;
		})
		.join('\n');
}
