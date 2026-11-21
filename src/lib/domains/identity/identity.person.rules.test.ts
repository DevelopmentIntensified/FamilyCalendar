/**
 * Pure person rules: the ONE Anonymous Account predicate, the email a client
 * may see, the person label, the profile privilege drop, the hourly
 * `lastActiveAt` touch and the stored-zone resolution. Expected values come
 * from the legacy code and its tests (`src/lib/utils/anonymous.test.ts`,
 * `src/lib/server/utils/userTimezone.test.ts`,
 * `src/lib/server/db/actions/users.test.ts`, `src/hooks.server.ts`).
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import {
	ANONYMOUS_EMAIL_DOMAIN,
	anonymousPersonValues,
	displayName,
	guestSafeEmail,
	isAnonymousAccount,
	isRegisteredAccount,
	LAST_ACTIVE_TOUCH_MS,
	profilePatch,
	SIGN_UP_TIME_ZONE,
	touchDue,
	zoneFromStored
} from './identity.person.rules';

type EmailHolder = { email?: string | null } | null | undefined;

describe('Anonymous Account', () => {
	it('is marked by the reserved placeholder domain', () => {
		expect(ANONYMOUS_EMAIL_DOMAIN).toBe('@anonymous.placeholder.invalid');
	});

	// anonymous.test.ts:5-15 (#241).
	it.each<[EmailHolder, boolean]>([
		[null, false],
		[undefined, false],
		[{ email: null }, false],
		[{ email: '' }, false],
		[{ email: `abc${ANONYMOUS_EMAIL_DOMAIN}` }, false],
		[{ email: 'real@user.com' }, true]
	])('isRegisteredAccount(%j) → %s', (user, expected) => {
		expect(isRegisteredAccount(user)).toBe(expected);
	});

	it.each<[EmailHolder, boolean]>([
		[null, false],
		[{ email: null }, false],
		[{ email: 'real@user.com' }, false],
		[{ email: `abc${ANONYMOUS_EMAIL_DOMAIN}` }, true],
		// Suffix match, so the domain inside an address is not enough.
		[{ email: `abc${ANONYMOUS_EMAIL_DOMAIN}.example.com` }, false]
	])('isAnonymousAccount is true only for the placeholder domain: %j → %s', (user, expected) => {
		expect(isAnonymousAccount(user)).toBe(expected);
	});

	// anonymous.test.ts:17-21.
	it('is never true for an Anonymous Account', () => {
		const guest = { email: `x${ANONYMOUS_EMAIL_DOMAIN}` };
		expect(isAnonymousAccount(guest)).toBe(true);
		expect(isRegisteredAccount(guest)).toBe(false);
	});

	// users.ts:121-140: a Guest row with the id-derived placeholder email.
	it('builds the guest row createAnonymousAccount writes', () => {
		expect(anonymousPersonValues('abc123def456ghi')).toEqual({
			id: 'abc123def456ghi',
			firstName: 'Guest',
			lastName: '',
			email: `abc123def456ghi${ANONYMOUS_EMAIL_DOMAIN}`,
			emailVerified: false,
			roles: []
		});
		expect(isAnonymousAccount(anonymousPersonValues('abc123def456ghi'))).toBe(true);
	});

	it('gives every sign-up settings row the UTC zone', () => {
		expect(SIGN_UP_TIME_ZONE).toBe('UTC');
	});
});

describe('guestSafeEmail', () => {
	// profile/+server.ts:26-27: the guest placeholder never leaves the server.
	it.each<[EmailHolder, string | null]>([
		[{ email: 'mia@example.com' }, 'mia@example.com'],
		[{ email: `guest${ANONYMOUS_EMAIL_DOMAIN}` }, null],
		[{ email: null }, null],
		[{ email: '' }, null],
		[null, null]
	])('%j → %j', (user, expected) => {
		expect(guestSafeEmail(user)).toBe(expected);
	});
});

describe('displayName', () => {
	// AccountSidebar.svelte:22-24: present parts joined by one space, the ends
	// trimmed, an empty label is null (the caller picks its own fallback).
	it.each<[{ firstName?: string | null; lastName?: string | null } | null, string | null]>([
		[{ firstName: 'Mia', lastName: 'Lopez' }, 'Mia Lopez'],
		[{ firstName: 'Guest', lastName: '' }, 'Guest'],
		[{ firstName: '', lastName: 'Lopez' }, 'Lopez'],
		[{ firstName: 'Mia', lastName: 'Lopez ' }, 'Mia Lopez'],
		[{ firstName: ' Mia', lastName: null }, 'Mia'],
		[{ firstName: 'Mia ', lastName: 'Lopez' }, 'Mia  Lopez'],
		[{ firstName: '', lastName: '' }, null],
		[{ firstName: ' ', lastName: '' }, null],
		[null, null]
	])('%j → %j', (person, expected) => {
		expect(displayName(person)).toBe(expected);
	});
});

describe('profilePatch', () => {
	// users.test.ts:173-188 (#168).
	it('profilePatch keeps only the safe fields, dropping privilege fields even if handed them', () => {
		const handed: {
			firstName: string;
			lastName: string;
			email: string;
			emailVerified: boolean;
			passwordHash: string;
			roles: string[];
		} = {
			firstName: 'Pat',
			lastName: 'Smith',
			email: 'mass.assigned@evil.test',
			emailVerified: true,
			passwordHash: '$2a$12$evilhash0000000000000000000000000000000000000000000000',
			roles: ['admin']
		};
		expect(profilePatch(handed)).toEqual({ firstName: 'Pat', lastName: 'Smith' });
	});

	it('drops an undefined name, so it keeps its stored value', () => {
		expect(profilePatch({ firstName: 'Pat', lastName: undefined })).toEqual({ firstName: 'Pat' });
	});
});

describe('touchDue', () => {
	const now = new Date('2026-01-15T12:00:00.000Z');

	it('waits an hour between touches', () => {
		expect(LAST_ACTIVE_TOUCH_MS).toBe(60 * 60 * 1000);
	});

	// hooks.server.ts:106-112: `Date.now() - lastActive > LAST_ACTIVE_TOUCH_MS`.
	it.each<[string, Date | null, boolean]>([
		['touched a minute ago', new Date('2026-01-15T11:59:00.000Z'), false],
		['touched exactly an hour ago', new Date('2026-01-15T11:00:00.000Z'), false],
		['touched an hour and a millisecond ago', new Date('2026-01-15T10:59:59.999Z'), true],
		['touched yesterday', new Date('2026-01-14T12:00:00.000Z'), true],
		['never touched', null, true]
	])('touch is due only after an hour: %s → %s', (_label, lastActiveAt, expected) => {
		expect(touchDue(lastActiveAt, now)).toBe(expected);
	});
});

describe('zoneFromStored', () => {
	// userTimezone.test.ts:5-14, plus the Luxon pseudo-zones: Q-107 narrows the
	// PATCH validator, never how an ALREADY stored zone resolves.
	it.each<[string | null | undefined, string | undefined]>([
		['America/Chicago', 'America/Chicago'],
		['UTC', 'UTC'],
		['local', 'local'],
		['UTC+5', 'UTC+5'],
		[null, undefined],
		[undefined, undefined],
		['', undefined],
		['Not/AZone', undefined]
	])('rejects missing, empty and invalid zones: %j → %j', (stored, expected) => {
		expect(zoneFromStored(stored)).toBe(expected);
	});
});
