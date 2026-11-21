/**
 * The `/family` page's presentation rules: initials, the roster strip's cap,
 * the per-family maps the rail walks, and the labels the plan pill and invite
 * band print. Pure tables — the same inputs the loader hands the page.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import type { FamilyActiveInvite, FamilyRosterRowView } from './family.contract';
import {
	FAMILY_ROSTER_STRIP_CAP,
	familyAtPlanLimit,
	familyExpiryLabel,
	familyInitial,
	familyInviteByFamily,
	familyInviteUsesLabel,
	familyPersonInitial,
	familyPlanLabel,
	familyRailPersonName,
	familyRosterByFamily,
	familyRosterStrip
} from './family.home.rules';

const CARD_MEMBERS = [
	{ firstName: 'Maya', userId: 'u-1' },
	{ firstName: 'Sam', userId: 'u-2' },
	{ firstName: 'Eli', userId: 'u-3' },
	{ firstName: 'Ruth', userId: 'u-4' },
	{ firstName: 'Ana', userId: 'u-5' },
	{ firstName: 'Jon', userId: 'u-6' },
	{ firstName: 'Kim', userId: 'u-7' }
];

function row(familyId: string, userId: string, firstName: string | null): FamilyRosterRowView {
	return {
		familyId,
		userId,
		firstName,
		lastName: 'Rivera',
		role: 'member',
		memberType: 'parent'
	};
}

function invite(familyId: string, code: string): FamilyActiveInvite {
	return {
		familyId,
		code,
		useCount: 1,
		maxUses: 5,
		expiresAt: new Date('2026-12-01T00:00:00.000Z')
	};
}

describe('familyInitial', () => {
	it.each([
		['Rivera Home', 'R'],
		['rivera', 'R'],
		['', 'F']
	])('prints the family initial of %s as %s', (name, expected) => {
		expect(familyInitial(name)).toBe(expected);
	});
});

describe('familyPersonInitial', () => {
	it.each([
		['Maya', 'M'],
		['maya', 'M'],
		[null, '•'],
		['', '•'],
		['   ', '•']
	])('prints one letter for %s, never a blank circle', (firstName, expected) => {
		expect(familyPersonInitial(firstName)).toBe(expected as string);
	});
});

describe('familyRosterStrip', () => {
	it('draws five avatars and counts the rest out loud', () => {
		expect(FAMILY_ROSTER_STRIP_CAP).toBe(5);
		expect(familyRosterStrip(CARD_MEMBERS)).toEqual({
			shown: CARD_MEMBERS.slice(0, 5),
			hidden: 2
		});
	});

	it('hides nothing when the family is small enough', () => {
		expect(familyRosterStrip(CARD_MEMBERS.slice(0, 3))).toEqual({
			shown: CARD_MEMBERS.slice(0, 3),
			hidden: 0
		});
	});

	it('answers an empty strip for a family with no names yet', () => {
		expect(familyRosterStrip([])).toEqual({ shown: [], hidden: 0 });
	});
});

describe('familyRosterByFamily', () => {
	it('keeps the loader order inside each family and adds a bucket per family', () => {
		const grouped = familyRosterByFamily([
			row('fam-1', 'u-1', 'Maya'),
			row('fam-2', 'u-2', 'Sam'),
			row('fam-1', 'u-3', 'Eli')
		]);
		expect(grouped.get('fam-1')?.map((person) => person.userId)).toEqual(['u-1', 'u-3']);
		expect(grouped.get('fam-2')?.map((person) => person.userId)).toEqual(['u-2']);
		expect(grouped.get('fam-3')).toBeUndefined();
	});
});

describe('familyInviteByFamily', () => {
	it('keys the live code by family, so a link can never show above another family', () => {
		const byFamily = familyInviteByFamily([invite('fam-1', 'HOP-1'), invite('fam-2', 'HOP-2')]);
		expect(byFamily.get('fam-1')?.code).toBe('HOP-1');
		expect(byFamily.get('fam-2')?.code).toBe('HOP-2');
		expect(byFamily.get('fam-3')).toBeUndefined();
	});
});

describe('familyInviteUsesLabel', () => {
	it.each([
		[{ useCount: 2, maxUses: 5 }, '2 of 5 used'],
		[{ useCount: 0, maxUses: 10 }, '0 of 10 used'],
		[{ useCount: 3, maxUses: null }, '3 of ∞ used'],
		[{ useCount: null, maxUses: null }, '0 of ∞ used']
	])('prints %o as %s', (value, expected) => {
		expect(familyInviteUsesLabel(value)).toBe(expected);
	});
});

describe('familyExpiryLabel', () => {
	it('reads a real instant as the date the rail prints', () => {
		const instant = new Date('2026-12-01T12:00:00.000Z');
		expect(familyExpiryLabel(instant)).toBe(instant.toLocaleDateString());
		expect(familyExpiryLabel(instant.toISOString())).toBe(instant.toLocaleDateString());
	});

	it('prints nothing for an unreadable value rather than "Invalid Date"', () => {
		expect(familyExpiryLabel('not an instant')).toBe('');
	});
});

describe('familyRailPersonName', () => {
	it.each([
		[{ firstName: 'Maya', lastName: 'Lopez' }, 'Maya Lopez'],
		[{ firstName: 'Maya', lastName: null }, 'Maya'],
		[{ firstName: null, lastName: null }, 'Family member']
	])('names %o as %s', (person, expected) => {
		expect(familyRailPersonName(person)).toBe(expected);
	});
});

describe('the plan pill', () => {
	it.each([
		[1, 1, '1 of 1 family on your plan'],
		[2, 5, '2 of 5 families on your plan']
	])('prints %i of %i in the right number', (used, limit, expected) => {
		expect(familyPlanLabel(used, limit)).toBe(expected);
	});

	it('offers the upgrade exactly at the limit, never below it', () => {
		expect(familyAtPlanLimit({ used: 1, limit: 1 })).toBe(true);
		expect(familyAtPlanLimit({ used: 2, limit: 1 })).toBe(true);
		expect(familyAtPlanLimit({ used: 0, limit: 1 })).toBe(false);
	});
});
