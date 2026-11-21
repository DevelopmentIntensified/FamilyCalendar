/**
 * access invite-email rules as plain tables: which token claims are readable,
 * which password the accept form may take, and how a form field reads.
 * Expected values come from the legacy
 * `(marketing)/family/invite/email/+page.server.ts` (`isInvitePayload`,
 * `formString`, the `password.length < 8` and the confirmation check).
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import {
	INVITE_EMAIL_INVALID_TOKEN,
	INVITE_EMAIL_MISSING_TOKEN,
	INVITE_PASSWORD_MISMATCH_MESSAGE,
	INVITE_PASSWORD_SHORT_MESSAGE,
	InviteEmailForm,
	inviteEmailPasswordRefusal,
	readInviteEmailPayload
} from './access.inviteEmail.rules';

const CLAIMS = {
	email: 'guest@example.test',
	firstName: 'Guest',
	lastName: 'User',
	familyId: 'fam-1'
};

describe('reads the invite token payload the legacy guard accepted', () => {
	it.each<{ what: string; value: unknown; expected: object | null }>([
		{ what: 'a full invite claim set', value: { ...CLAIMS, inviteCode: 'code-1' }, expected: { ...CLAIMS, inviteCode: 'code-1' } },
		{ what: 'the same claims without the invite row (legacy token)', value: { ...CLAIMS }, expected: { ...CLAIMS } },
		{ what: 'a non-object', value: 'token', expected: null },
		{ what: 'null', value: null, expected: null },
		{ what: 'a missing email', value: { ...CLAIMS, email: undefined }, expected: null },
		{ what: 'a blank email', value: { ...CLAIMS, email: '' }, expected: null },
		{ what: 'a numeric first name', value: { ...CLAIMS, firstName: 7 }, expected: null },
		{ what: 'a blank last name', value: { ...CLAIMS, lastName: '' }, expected: null },
		{ what: 'a blank family id', value: { ...CLAIMS, familyId: '' }, expected: null },
		{ what: 'a numeric invite code', value: { ...CLAIMS, inviteCode: 12 }, expected: null }
	])('$what', ({ value, expected }) => {
		expect(readInviteEmailPayload(value)).toEqual(expected);
	});
});

describe('keeps the sign-up password floor and the confirmation', () => {
	it.each<{ what: string; password: string; confirmation: string; expected: string | null }>([
		{ what: 'an empty password', password: '', confirmation: '', expected: INVITE_PASSWORD_SHORT_MESSAGE },
		{ what: 'seven characters', password: 'only7xx', confirmation: 'only7xx', expected: INVITE_PASSWORD_SHORT_MESSAGE },
		{ what: 'eight characters, confirmation differs', password: 'eight888', confirmation: 'eight889', expected: INVITE_PASSWORD_MISMATCH_MESSAGE },
		{ what: 'eight characters, confirmed', password: 'eight888', confirmation: 'eight888', expected: null },
		{ what: 'a passphrase, confirmed', password: 'correct horse 8', confirmation: 'correct horse 8', expected: null }
	])('$what', ({ password, confirmation, expected }) => {
		expect(inviteEmailPasswordRefusal(password, confirmation)).toBe(expected);
	});
});

describe('reads a form field the legacy way', () => {
	it.each<{ what: string; value: unknown; expected: string }>([
		{ what: 'text as it arrives', value: 'abc', expected: 'abc' },
		{ what: 'a missing field', value: undefined, expected: '' },
		{ what: 'a repeated field takes its first value', value: ['first', 'second'], expected: 'first' },
		{ what: 'a file field reads as absent', value: new File(['x'], 'x.txt'), expected: '' }
	])('$what', ({ value, expected }) => {
		const parsed = InviteEmailForm.parse({ token: value });
		expect(parsed.token).toBe(expected);
	});

	it('names the two legacy login error codes', () => {
		expect(INVITE_EMAIL_MISSING_TOKEN).toBe('missing_token');
		expect(INVITE_EMAIL_INVALID_TOKEN).toBe('invalid_token');
	});
});
