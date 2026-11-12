/**
 * Pins the colour hashes. Kernel ui; see [../README.md](../README.md).
 *
 * The expected numbers are today's legacy output (`utils/hashName.ts`,
 * `utils/contactColors.ts`, `utils/avatarColor.ts`) worked through by hand and
 * written as literals. They are the promise that a name keeps its store and
 * contact colour, and an id keeps its avatar, across the rewrite.
 */
import { describe, it, expect } from 'vitest';
import { idColor, initials, nameColor } from './colorHash';

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
 * `hashName` mixes with `hash << 5`, so it truncates to int32 every step:
 * "anna brooks" wraps positive, "Rivera" wraps negative. `nameColor` takes
 * the absolute value, which is why the store and contact palettes can index
 * with a plain `% length`.
 */
const NAME_CASES: [string, number][] = [
	['', 0],
	['Aldi', 2043408],
	['ALDI', 2011632],
	['Costco', 2024204569],
	['Sam', 82879],
	['sam', 113631],
	['SAM', 81855],
	['Émile', 188979294],
	['Zoë', 90166],
	['Rivera', 1846791179],
	['  ALDI ', 686159824],
	['anna brooks', 3194812696],
	// charCodeAt walks UTF-16 units, so an astral glyph hashes as its surrogates.
	['👪', 1772493]
];

const ID_CASES: [string, string][] = [
	['', 'bg-rose-100 text-rose-700'],
	['user-123', 'bg-emerald-100 text-emerald-700'],
	['u-sam', 'bg-sky-100 text-sky-700'],
	['Sam', 'bg-amber-100 text-amber-700'],
	['SAM', 'bg-amber-100 text-amber-700'],
	['Émile', 'bg-rose-100 text-rose-700'],
	['Zoë', 'bg-violet-100 text-violet-700'],
	['member-0', 'bg-fuchsia-100 text-fuchsia-700'],
	['member-1', 'bg-lime-100 text-lime-700'],
	['u-mom', 'bg-sky-100 text-sky-700'],
	['👪', 'bg-orange-100 text-orange-700']
];

describe('nameColor', () => {
	it('is deterministic for the same name', () => {
		expect(nameColor('Aldi')).toBe(nameColor('Aldi'));
		expect(nameColor('Rivera')).toBe(nameColor('Rivera'));
	});

	it('is not a constant: different names hash differently in general', () => {
		expect(nameColor('Aldi')).not.toBe(nameColor('Costco'));
		expect(nameColor('Sam')).not.toBe(nameColor('sam'));
	});

	it.each(NAME_CASES)('pins the name hash for %j', (name, expected) => {
		expect(nameColor(name)).toBe(expected);
	});

	it('is never negative, so a palette can be indexed with a plain modulo', () => {
		for (const [name] of NAME_CASES) expect(nameColor(name)).toBeGreaterThanOrEqual(0);
	});
});

describe('idColor', () => {
	it('returns the same colour for the same id', () => {
		expect(idColor('user-123')).toBe(idColor('user-123'));
	});

	it('can return different colours for different ids', () => {
		const ids = Array.from({ length: 20 }, (_, i) => `user-${i}`);
		expect(new Set(ids.map((id) => idColor(id))).size).toBeGreaterThan(1);
	});

	it('always returns a member of the avatar palette', () => {
		const ids = Array.from({ length: 50 }, (_, i) => `member-${i}`);
		for (const id of ids) expect(AVATAR_COLOURS).toContain(idColor(id));
	});

	it.each(ID_CASES)('pins the avatar colour for %j', (id, expected) => {
		expect(idColor(id)).toBe(expected);
	});
});

/** Legacy `getInitials`: no re-capitalising once a last name is present. */
const INITIAL_CASES: [string | null | undefined, string | null | undefined, string][] = [
	['Sam', 'Rivera', 'SR'],
	['Mom', '', 'M'],
	['mom', null, 'M'],
	['sam', 'rivera', 'sr'],
	['', 'Rivera', 'R'],
	[null, 'Rivera', 'R'],
	['', '', ''],
	[null, null, ''],
	[undefined, undefined, ''],
	['Émile', 'Zola', 'ÉZ'],
	['émile', 'zola', 'éz'],
	['Aren', 'brook', 'Ab']
];

describe('initials', () => {
	it.each(INITIAL_CASES)('initials(%j, %j) is %j', (first, last, expected) => {
		expect(initials(first, last)).toBe(expected);
	});
});
