import { describe, it, expect } from 'vitest';
import type { TaskQuickAddMember } from './taskQuickAdd';
import { filterMentions, MENTION_SUGGESTION_LIMIT } from './mentionFilter';

/**
 * Mention filter — the suggestion-list half of the discussion picker.
 * Purely prefix-based, case-insensitive, roster-scoped. This is the
 * non-authoritative side of the pairing: `findTaskAssignee` decides what
 * survives parsing; this only decides what to surface while typing.
 */
const ROSTER: TaskQuickAddMember[] = [
	{ userId: 'u-sam', firstName: 'Sam', lastName: 'Rivera' },
	{ userId: 'u-mom', firstName: 'Mom', lastName: '' },
	{ userId: 'u-dad', firstName: 'Dad', lastName: 'Chen' },
	{ userId: 'u-anna', firstName: 'Anna', lastName: 'Brooks' }
];

function ids(members: TaskQuickAddMember[]): string[] {
	return members.map((m) => m.userId);
}

describe('filterMentions', () => {
	it('prefix-matches on firstName', () => {
		expect(ids(filterMentions('sam', ROSTER))).toEqual(['u-sam']);
		expect(ids(filterMentions('d', ROSTER))).toEqual(['u-dad']);
	});

	it('prefix-matches on lastName', () => {
		expect(ids(filterMentions('riv', ROSTER))).toEqual(['u-sam']);
		expect(ids(filterMentions('bro', ROSTER))).toEqual(['u-anna']);
	});

	it('is case-insensitive', () => {
		expect(ids(filterMentions('SAM', ROSTER))).toEqual(['u-sam']);
		expect(ids(filterMentions('RiVeRa', ROSTER))).toEqual(['u-sam']);
		expect(ids(filterMentions('MOM', ROSTER))).toEqual(['u-mom']);
	});

	it('prefix-matches the full "first last" name', () => {
		expect(ids(filterMentions('sam riv', ROSTER))).toEqual(['u-sam']);
		expect(ids(filterMentions('dad chen', ROSTER))).toEqual(['u-dad']);
	});

	it('returns multiple matches in roster order', () => {
		const multi: TaskQuickAddMember[] = [
			{ userId: 'u-sam', firstName: 'Sam', lastName: 'Rivera' },
			{ userId: 'u-sara', firstName: 'Sara', lastName: 'Stern' },
			{ userId: 'u-dad', firstName: 'Dad', lastName: 'Chen' }
		];
		// "s" hits Sam's and Sara's first names and Sara's last name.
		expect(ids(filterMentions('s', multi))).toEqual(['u-sam', 'u-sara']);
	});

	it('returns the full roster for an empty fragment', () => {
		expect(ids(filterMentions('', ROSTER))).toEqual(['u-sam', 'u-mom', 'u-dad', 'u-anna']);
		expect(ids(filterMentions('   ', ROSTER))).toEqual(['u-sam', 'u-mom', 'u-dad', 'u-anna']);
	});

	it('caps the empty-fragment roster at the suggestion limit', () => {
		const big: TaskQuickAddMember[] = Array.from({ length: 10 }, (_, i) => ({
			userId: `u-${i}`,
			firstName: `Member ${i}`,
			lastName: ''
		}));
		expect(filterMentions('', big)).toHaveLength(MENTION_SUGGESTION_LIMIT);
	});

	it('caps large match sets too', () => {
		const big: TaskQuickAddMember[] = Array.from({ length: 12 }, (_, i) => ({
			userId: `u-${i}`,
			firstName: `Alex ${i}`,
			lastName: 'Stern'
		}));
		expect(filterMentions('alex', big)).toHaveLength(MENTION_SUGGESTION_LIMIT);
	});

	it('returns [] when nothing matches', () => {
		expect(filterMentions('zzz', ROSTER)).toEqual([]);
		expect(filterMentions('sammy', ROSTER)).toEqual([]);
	});

	it('returns [] when there are no members', () => {
		expect(filterMentions('sam', [])).toEqual([]);
		expect(filterMentions('', [])).toEqual([]);
	});

	it('returns [] for a fragment starting with a non-letter', () => {
		expect(filterMentions('1', ROSTER)).toEqual([]);
		expect(filterMentions('-', ROSTER)).toEqual([]);
		expect(filterMentions('@', ROSTER)).toEqual([]);
	});

	it('trims surrounding whitespace from the fragment', () => {
		expect(ids(filterMentions('  sam ', ROSTER))).toEqual(['u-sam']);
	});
});
