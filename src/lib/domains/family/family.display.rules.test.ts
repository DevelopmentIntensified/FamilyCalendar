/**
 * Pure display rules. Carries the legacy `familyDisplay.test.ts` cases and
 * widens each into a table over every (viewer role × member role) pair, with
 * expected values read off the README Invariant: creator on anyone but self,
 * admin on plain members only, nobody removes self or a creator.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import {
	canEditRole,
	canRemove,
	memberDisplayName,
	rolePillClass,
	type DisplayMember
} from './family.display.rules';

const other: DisplayMember = { userId: 'u2', role: 'member', firstName: 'Bo', lastName: 'Jo' };
const adminMember: DisplayMember = { userId: 'u3', role: 'admin', firstName: 'Al', lastName: '' };
const creatorMember: DisplayMember = { userId: 'u9', role: 'creator' };
const self = (role: string): DisplayMember => ({ userId: 'me', role });

type RoleCase = [string, DisplayMember, string | null | undefined, boolean];

describe('canEditRole: creator on anyone but self, admin on members only', () => {
	// Legacy familyDisplay.test.ts:8-15.
	it.each<RoleCase>([
		['a plain member, viewed by the creator', other, 'creator', true],
		['yourself, viewed as creator', self('creator'), 'creator', false],
		['a plain member, viewed by an admin', other, 'admin', true],
		['another admin, viewed by an admin', adminMember, 'admin', false],
		['a plain member, viewed by a plain member', other, 'member', false],
		['an admin, viewed by the creator', adminMember, 'creator', true],
		['the creator, viewed by an admin', creatorMember, 'admin', false],
		['a plain member, viewed with no role', other, null, false],
		['a plain member, viewed with an undefined role', other, undefined, false]
	])('%s → %s', (_what, member, viewerRole, expected) => {
		expect(canEditRole(member, viewerRole, 'me')).toBe(expected);
	});
});

describe('canRemove: nobody removes themselves or a creator', () => {
	// Legacy familyDisplay.test.ts:18-24.
	it.each<RoleCase>([
		['a plain member, viewed by the creator', other, 'creator', true],
		['yourself, viewed as creator', self('creator'), 'creator', false],
		['a plain member, viewed by a plain member', other, 'member', false],
		['the creator, viewed by the creator', creatorMember, 'creator', false],
		['a plain member, viewed by an admin', other, 'admin', true],
		['another admin, viewed by an admin', adminMember, 'admin', false],
		['an admin, viewed by the creator', adminMember, 'creator', true],
		['the creator, viewed by an admin', creatorMember, 'admin', false],
		['yourself, viewed as admin', self('admin'), 'admin', false]
	])('%s → %s', (_what, member, viewerRole, expected) => {
		expect(canRemove(member, viewerRole, 'me')).toBe(expected);
	});
});

describe('memberDisplayName', () => {
	// Legacy familyDisplay.test.ts:27-32.
	it.each<[string, DisplayMember, string]>([
		['a full name', other, 'Bo Jo'],
		['only a first name', { userId: 'u', firstName: 'Bo', lastName: '' }, 'Bo'],
		['only a last name', { userId: 'u', firstName: null, lastName: 'Jo' }, 'Jo'],
		['no name but an email', { userId: 'u2', email: 'bo@x.com' }, 'bo@x.com'],
		['blank names and an email', { userId: 'u', firstName: '', lastName: '', email: 'bo@x.com' }, 'bo@x.com'],
		['nothing at all', { userId: 'u2' }, 'Family member']
	])('%s → %j', (_what, member, expected) => {
		expect(memberDisplayName(member)).toBe(expected);
	});
});

describe('rolePillClass', () => {
	// Legacy familyDisplay.test.ts:35-39: distinct classes per role.
	it.each<[string, string]>([
		['creator', 'amber'],
		['admin', 'emerald'],
		['member', 'blue'],
		['anything else', 'blue']
	])('%s pill uses the %s colour', (role, colour) => {
		expect(rolePillClass(role)).toContain(colour);
	});

	it('keeps the three roles visually distinct', () => {
		const classes = ['creator', 'admin', 'member'].map(rolePillClass);
		expect(new Set(classes).size).toBe(3);
	});
});
