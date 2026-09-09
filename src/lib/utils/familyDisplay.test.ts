import { describe, it, expect } from 'vitest';
import { canEditRole, canRemove, memberDisplayName, rolePillClass } from './familyDisplay';

const other = { userId: 'u2', role: 'member', firstName: 'Bo', lastName: 'Jo' };
const admin = { userId: 'u3', role: 'admin', firstName: 'Al', lastName: '' };

describe('canEditRole', () => {
	it('allows creators on anyone but self, admins on members only', () => {
		expect(canEditRole(other, 'creator', 'me')).toBe(true);
		expect(canEditRole({ ...other, userId: 'me' }, 'creator', 'me')).toBe(false);
		expect(canEditRole(other, 'admin', 'me')).toBe(true);
		expect(canEditRole(admin, 'admin', 'me')).toBe(false);
		expect(canEditRole(other, 'member', 'me')).toBe(false);
	});
});

describe('canRemove', () => {
	it('blocks self-removal, creators, and non-admins', () => {
		expect(canRemove(other, 'creator', 'me')).toBe(true);
		expect(canRemove({ ...other, userId: 'me' }, 'creator', 'me')).toBe(false);
		expect(canRemove(other, 'member', 'me')).toBe(false);
		expect(canRemove({ userId: 'u9', role: 'creator' }, 'creator', 'me')).toBe(false);
	});
});

describe('memberDisplayName', () => {
	it('prefers full name, falls back to email then placeholder', () => {
		expect(memberDisplayName({ ...other })).toBe('Bo Jo');
		expect(memberDisplayName({ userId: 'u2', email: 'bo@x.com' })).toBe('bo@x.com');
		expect(memberDisplayName({ userId: 'u2' })).toBe('Family member');
	});
});

describe('rolePillClass', () => {
	it('returns distinct classes per role', () => {
		expect(rolePillClass('creator')).toContain('amber');
		expect(rolePillClass('admin')).toContain('emerald');
		expect(rolePillClass('member')).toContain('blue');
	});
});
