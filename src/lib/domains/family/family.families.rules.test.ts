/**
 * Pure family rules: the create form's refusals, the day-one picks, the
 * rename patch and how a `/family` card is composed. Carries the legacy
 * `create/members.test.ts` pick cases (:176-221); expected values read off the
 * README Invariants and the golden bodies, never from running the code.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import type { JsonValue } from '$lib/kernel/validation/validators';
import type { FamilyMembershipView } from './family.contract';
import {
	buildFamilyCard,
	cardMembers,
	cleanMemberIds,
	familyCreatedLabel,
	familyDraft,
	familyPatch,
	FAMILY_NAME_MAX,
	firstNameOf,
	hasUnaddablePick,
	dayOneRosterRefusal,
	type CardRosterRow,
	type FamilyDraftResult,
	type FamilyPatch
} from './family.families.rules';
import { DEFAULT_FAMILY_COLOR, FAMILY_PALETTE } from './family.palette.rules';

const SAGE = FAMILY_PALETTE[2].value;

describe('familyDraft: the create form after the plan gate', () => {
	const refusal = (message: string): FamilyDraftResult => ({
		ok: false,
		refusal: { status: 400, message }
	});
	const draft = (name: string, color: string): FamilyDraftResult => ({
		ok: true,
		draft: { name, color }
	});

	it.each<[string, string, string, FamilyDraftResult]>([
		['no name', '', '', refusal('Family name is required')],
		['a blank name', '   ', '', refusal('Family name is required')],
		['a name over fifty characters', 'x'.repeat(FAMILY_NAME_MAX + 1), '', refusal('Family name must be 50 characters or less')],
		['a name of exactly fifty', 'x'.repeat(FAMILY_NAME_MAX), '', draft('x'.repeat(FAMILY_NAME_MAX), DEFAULT_FAMILY_COLOR)],
		['fifty characters plus padding (the cap is on the trimmed name)', `  ${'x'.repeat(FAMILY_NAME_MAX)}  `, '', draft('x'.repeat(FAMILY_NAME_MAX), DEFAULT_FAMILY_COLOR)],
		['a colour outside the palette', 'Riveras', '#000001', refusal('Pick one of the offered family colours')],
		['the retired blue', 'Riveras', '#3B82F6', refusal('Pick one of the offered family colours')],
		['a palette colour in the wrong case', 'Riveras', SAGE.toUpperCase(), refusal('Pick one of the offered family colours')],
		['no colour (the palette default)', ' Riveras ', '', draft('Riveras', DEFAULT_FAMILY_COLOR)],
		['a palette colour', 'Riveras', SAGE, draft('Riveras', SAGE)]
	])('%s', (_what, name, color, expected) => {
		expect(familyDraft(name, color)).toEqual(expected);
	});

	it('checks the name before the colour', () => {
		expect(familyDraft('', '#000001')).toEqual(refusal('Family name is required'));
	});
});

describe('cleanMemberIds', () => {
	// Legacy create/members.test.ts:176-188 and the golden "deduped picks".
	it.each<[string, readonly JsonValue[], string[]]>([
		['nobody picked', [], []],
		['the creator picking themselves', ['creator-1'], []],
		['a repeated pick, collapsed', ['user-1', 'user-1'], ['user-1']],
		['the creator among others, dropped', ['bob', 'creator-1', 'bob'], ['bob']],
		['blanks and padding', ['  ', 'bob', ' bob ', ''], ['bob']],
		['a non-string, dropped rather than refused', [5, null, true, { id: 'x' }, ['y'], 'bob'], ['bob']],
		['first-seen order', ['c', 'a', 'b', 'a'], ['c', 'a', 'b']],
		['the creator id with padding', [' creator-1 '], []]
	])('%s', (_what, values, expected) => {
		expect(cleanMemberIds(values, 'creator-1')).toEqual(expected);
	});

	it('does not mutate the list it was given', () => {
		const values: JsonValue[] = ['b', 'a', 'b'];
		cleanMemberIds(values, 'me');
		expect(values).toEqual(['b', 'a', 'b']);
	});
});

describe('hasUnaddablePick', () => {
	it.each<[string, string[], string[], boolean]>([
		['nobody picked', [], [], false],
		['everyone verified', ['a', 'b'], ['a', 'b', 'z'], false],
		['one unverified or unknown pick', ['a', 'b'], ['a'], true],
		['nobody verified', ['a'], [], true]
	])('%s → %s', (_what, picked, verified, expected) => {
		expect(hasUnaddablePick(picked, new Set(verified))).toBe(expected);
	});
});

describe('dayOneRosterRefusal: the creator counts as one', () => {
	// Legacy create/members.test.ts:205-221 and the golden "refuses more picks than the plan allows".
	it.each<[string, number, number, boolean]>([
		['nobody picked, however low the limit', 1, 0, false],
		['a pick that exactly fills the limit of 3', 3, 2, false],
		['a pick one over the limit of 3', 3, 3, true],
		['two picks against a limit of 2', 2, 2, true],
		['six picks against the default limit of 6', 6, 6, true],
		['five picks against the default limit of 6', 6, 5, false]
	])('%s', (_what, memberLimit, picked, refused) => {
		expect(dayOneRosterRefusal(memberLimit, picked) !== null).toBe(refused);
	});

	it('names the limit, pluralised, in the legacy copy', () => {
		expect(dayOneRosterRefusal(6, 6)).toEqual({
			status: 403,
			message:
				'Your plan allows 6 members in a family. Create the family first, then add the rest from the family page.'
		});
		expect(dayOneRosterRefusal(1, 1)).toEqual({
			status: 403,
			message:
				'Your plan allows 1 member in a family. Create the family first, then add the rest from the family page.'
		});
	});
});

describe('familyPatch: what a rename writes', () => {
	it.each<[string, string, string, FamilyPatch | null]>([
		['both fields', 'Riveras', '#000001', { name: 'Riveras', color: '#000001' }],
		['only a name', 'Riveras', '', { name: 'Riveras' }],
		['only a colour', '', '#000001', { color: '#000001' }],
		['neither: nothing to write', '', '', null]
	])('%s', (_what, name, color, expected) => {
		expect(familyPatch(name, color)).toEqual(expected);
	});
});

describe('cardMembers: the avatar id is recovered by first name (Q-023, pinned until the fix)', () => {
	const roster: CardRosterRow[] = [
		{ familyId: 'f1', userId: 'u-ann', firstName: 'Ann' },
		{ familyId: 'f1', userId: 'u-sam-1', firstName: 'Sam' },
		{ familyId: 'f1', userId: 'u-sam-2', firstName: 'Sam' },
		{ familyId: 'f2', userId: 'u-bea', firstName: 'Bea' }
	];

	it('gives each distinct first name its own person', () => {
		expect(cardMembers('f1', ['Ann', 'Sam'], roster)).toEqual([
			{ firstName: 'Ann', userId: 'u-ann' },
			{ firstName: 'Sam', userId: 'u-sam-1' }
		]);
	});

	it('gives two members who share a first name the FIRST one\'s id', () => {
		expect(cardMembers('f1', ['Sam', 'Sam'], roster)).toEqual([
			{ firstName: 'Sam', userId: 'u-sam-1' },
			{ firstName: 'Sam', userId: 'u-sam-1' }
		]);
	});

	it('looks only inside the card\'s own family', () => {
		expect(cardMembers('f1', ['Bea'], roster)).toEqual([{ firstName: 'Bea', userId: 'roster-0' }]);
	});

	it('falls back to roster-{index} when no row matches', () => {
		expect(cardMembers('f1', ['Ann', 'Zed', 'Yan'], roster)).toEqual([
			{ firstName: 'Ann', userId: 'u-ann' },
			{ firstName: 'Zed', userId: 'roster-1' },
			{ firstName: 'Yan', userId: 'roster-2' }
		]);
	});

	it('is empty for a family with no names', () => {
		expect(cardMembers('f1', [], roster)).toEqual([]);
	});
});

describe('familyCreatedLabel', () => {
	it.each<[string, string, string]>([
		['2026-01-05T12:00:00.000Z', 'UTC', '1/5/2026'],
		['2026-11-11T03:00:00.000Z', 'UTC', '11/11/2026'],
		['2026-11-11T03:00:00.000Z', 'America/Los_Angeles', '11/10/2026'],
		['2026-12-31T23:30:00.000Z', 'Pacific/Auckland', '1/1/2027']
	])('%s in %s → %s', (iso, zone, expected) => {
		expect(familyCreatedLabel(new Date(iso), zone)).toBe(expected);
	});
});

describe('buildFamilyCard', () => {
	const createdAt = new Date('2026-01-05T12:00:00.000Z');
	const membership = (overrides: Partial<FamilyMembershipView> = {}): FamilyMembershipView => ({
		family: { id: 'f1', name: 'Riveras', color: '#c45e38', createdAt },
		role: 'creator',
		memberType: 'parent',
		memberCount: 2,
		firstNames: ['Ann', 'Bob'],
		...overrides
	});
	const roster: CardRosterRow[] = [
		{ familyId: 'f1', userId: 'u-ann', firstName: 'Ann' },
		{ familyId: 'f1', userId: 'u-bob', firstName: 'Bob' }
	];

	it('composes the whole card', () => {
		expect(buildFamilyCard(membership(), 3, roster, 'UTC')).toEqual({
			id: 'f1',
			name: 'Riveras',
			color: '#c45e38',
			createdAt,
			memberCount: 2,
			openTasks: 3,
			members: [
				{ firstName: 'Ann', userId: 'u-ann' },
				{ firstName: 'Bob', userId: 'u-bob' }
			],
			createdLabel: '1/5/2026',
			canInvite: true,
			role: 'creator'
		});
	});

	it.each<[string | null, boolean]>([
		['creator', true],
		['admin', true],
		['member', false],
		[null, false]
	])('offers "Invite by link" for the viewer\'s role %j: %s', (role, canInvite) => {
		expect(buildFamilyCard(membership({ role }), 0, roster, 'UTC')).toMatchObject({
			canInvite,
			role
		});
	});

	it('keeps Member Type out of the card entirely: it gates nothing', () => {
		const card = buildFamilyCard(membership({ memberType: 'child', role: 'member' }), 0, roster, 'UTC');
		expect(card.canInvite).toBe(false);
		expect(card).not.toHaveProperty('memberType');
	});
});

describe('firstNameOf', () => {
	const roster = [
		{ userId: 'u1', firstName: 'Maya' },
		{ userId: 'u2', firstName: '' }
	];

	it.each<[string | null | undefined, string | null]>([
		['u1', 'Maya'],
		['u2', null],
		['ghost', null],
		['', null],
		[null, null],
		[undefined, null]
	])('firstNameOf(%j) → %j', (userId, expected) => {
		expect(firstNameOf(roster, userId)).toBe(expected);
	});
});
