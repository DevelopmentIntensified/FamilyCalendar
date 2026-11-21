/**
 * Pure rules for the Anonymous Account predicate access needs: the
 * placeholder domain, "registered" and the guest-safe email mask. Expected
 * values come from the legacy predicate and its test
 * (`src/lib/utils/anonymous.ts:12-27`, `src/lib/utils/anonymous.test.ts:5-21`),
 * never from running this code.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import {
	GUEST_EMAIL_SUFFIX,
	isGuestPerson,
	isRegisteredPerson,
	maskGuestEmail,
	type AccessPerson
} from './access.person.rules';

const GUEST_EMAIL = `abc${GUEST_EMAIL_SUFFIX}`;

describe('the Anonymous Account predicate', () => {
	it('uses the reserved placeholder domain', () => {
		expect(GUEST_EMAIL_SUFFIX).toBe('@anonymous.placeholder.invalid');
	});

	it.each<[AccessPerson | null | undefined, boolean, boolean]>([
		[null, false, false],
		[undefined, false, false],
		[{ email: null }, false, false],
		[{ email: '' }, false, false],
		[{ email: GUEST_EMAIL }, true, false],
		[{ email: 'real@user.com' }, false, true],
		// The domain must END the address: a lookalike host is a real address.
		[{ email: `${GUEST_EMAIL}.example.com` }, false, true]
	])('classifies %j as guest=%s registered=%s', (person, guest, registered) => {
		expect(isGuestPerson(person)).toBe(guest);
		expect(isRegisteredPerson(person)).toBe(registered);
	});
});

describe('maskGuestEmail', () => {
	it.each<[AccessPerson | null | undefined, string | null]>([
		[{ email: GUEST_EMAIL }, null],
		[{ email: 'real@user.com' }, 'real@user.com'],
		[{ email: null }, null],
		[null, null],
		[undefined, null]
	])('masks %j to %j', (person, expected) => {
		expect(maskGuestEmail(person)).toBe(expected);
	});
});
