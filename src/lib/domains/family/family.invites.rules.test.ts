/**
 * Pure invite rules: the shared default, the two clamps, the mint presets and
 * the one usability predicate. Carries the legacy `families.test.ts` clamp and
 * default cases (:440-502); the rest reads off the README Invariants.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import type { JsonValue } from '$lib/kernel/validation/validators';
import {
	clampInviteDays,
	clampInviteUses,
	DEFAULT_INVITE_DAYS,
	DEFAULT_INVITE_MAX_USES,
	EMAIL_INVITE_PLAN,
	inviteExpiresAt,
	inviteRefusalCopy,
	isInviteRefusal,
	isInviteUsable,
	LINK_INVITE_PLAN,
	shareInvitePlan,
	type InviteAnswer,
	type InviteLife
} from './family.invites.rules';

const NOW = new Date('2026-11-11T12:00:00.000Z');
const HOUR = 3_600_000;

type ClampCase = [string, JsonValue | undefined, number];

describe('the invite defaults are declared once', () => {
	// Legacy families.test.ts:441-451: the action and the route used to disagree.
	it('admits ten people and lives seven days unless told otherwise', () => {
		expect(DEFAULT_INVITE_MAX_USES).toBe(10);
		expect(DEFAULT_INVITE_DAYS).toBe(7);
	});

	it('mints at the shared default when the body names neither count', () => {
		expect(shareInvitePlan(undefined, undefined)).toEqual({
			days: DEFAULT_INVITE_DAYS,
			maxUses: DEFAULT_INVITE_MAX_USES
		});
	});

	it('mints an emailed invite single-use for one day, and a link at the shared default for one day', () => {
		expect(EMAIL_INVITE_PLAN).toEqual({ days: 1, maxUses: 1 });
		expect(LINK_INVITE_PLAN).toEqual({ days: 1, maxUses: DEFAULT_INVITE_MAX_USES });
	});
});

describe('clampInviteDays (1-30, default 7)', () => {
	// Legacy families.test.ts:469-481, expiresInDaysCases.
	it.each<ClampCase>([
		['a missing value falls back to 7 days', undefined, 7],
		['null falls back to 7 days', null, 7],
		['an empty string falls back to 7 days', '', 7],
		['a non-numeric string falls back to 7 days', 'never', 7],
		['zero clamps up to 1 day', 0, 1],
		['a negative clamps up to 1 day', -5, 1],
		['an in-range value passes through', 14, 14],
		['a numeric string passes through', '14', 14],
		['a fraction truncates', 14.9, 14],
		['a huge value clamps down to 30 days', 1000, 30],
		['the upper edge is allowed', 30, 30],
		['one past the upper edge clamps', 31, 30],
		['the lower edge is allowed', 1, 1]
	])('%s', (_what, input, expected) => {
		expect(clampInviteDays(input)).toBe(expected);
	});
});

describe('clampInviteUses (1-50, default 10)', () => {
	// Legacy families.test.ts:489-495, maxUsesCases.
	it.each<ClampCase>([
		['a missing value falls back to 10 uses', undefined, 10],
		['NaN falls back to 10 uses', Number.NaN, 10],
		['zero clamps up to 1 use', 0, 1],
		['an in-range value passes through', 25, 25],
		['a huge value clamps down to 50 uses', 100000, 50],
		['a numeric string passes through', '3', 3],
		['the upper edge is allowed', 50, 50],
		['one past the upper edge clamps', 51, 50],
		['a boolean is junk and falls back', true, 10]
	])('%s', (_what, input, expected) => {
		expect(clampInviteUses(input)).toBe(expected);
	});
});

describe('shareInvitePlan clamps each count on its own', () => {
	it('reads the golden mint bodies: huge, zero and numeric strings', () => {
		expect(shareInvitePlan(100, 999)).toEqual({ days: 30, maxUses: 50 });
		expect(shareInvitePlan(0, 0)).toEqual({ days: 1, maxUses: 1 });
		expect(shareInvitePlan('3', '3')).toEqual({ days: 3, maxUses: 3 });
	});

	it('does not let one junk count disturb the other', () => {
		expect(shareInvitePlan('soon', 5)).toEqual({ days: 7, maxUses: 5 });
		expect(shareInvitePlan(2, null)).toEqual({ days: 2, maxUses: 10 });
	});
});

describe('inviteExpiresAt', () => {
	it.each<[number, string]>([
		[1, '2026-11-12T12:00:00.000Z'],
		[7, '2026-11-18T12:00:00.000Z'],
		[30, '2026-12-11T12:00:00.000Z']
	])('a code minted now with %i day(s) lapses at %s', (days, expected) => {
		expect(inviteExpiresAt(NOW, days).toISOString()).toBe(expected);
	});

	it('does not move the instant it was given', () => {
		const before = NOW.getTime();
		inviteExpiresAt(NOW, 7);
		expect(NOW.getTime()).toBe(before);
	});
});

describe('isInviteUsable', () => {
	const live = (overrides: Partial<InviteLife> = {}): InviteLife => ({
		expiresAt: new Date(NOW.getTime() + HOUR),
		maxUses: 10,
		useCount: 0,
		...overrides
	});

	it.each<[string, InviteLife, boolean]>([
		['a live code with uses left', live(), true],
		['a code one use short of its cap', live({ maxUses: 5, useCount: 4 }), true],
		['a code at its cap', live({ maxUses: 5, useCount: 5 }), false],
		['a code past its cap', live({ maxUses: 1, useCount: 3 }), false],
		['an uncapped code, however used', live({ maxUses: null, useCount: 99 }), true],
		['a code with no use count', live({ maxUses: 5, useCount: null }), true],
		['an uncapped code with no use count', live({ maxUses: null, useCount: null }), true],
		['a code that lapsed an hour ago', live({ expiresAt: new Date(NOW.getTime() - HOUR) }), false],
		['a code that lapses this very instant', live({ expiresAt: new Date(NOW.getTime()) }), false],
		['a code that lapses a millisecond from now', live({ expiresAt: new Date(NOW.getTime() + 1) }), true],
		['an expired uncapped code', live({ expiresAt: new Date(NOW.getTime() - 1), maxUses: null }), false]
	])('%s → %s', (_what, invite, expected) => {
		expect(isInviteUsable(invite, NOW)).toBe(expected);
	});
});

describe('the one refusal answer for a code that cannot be accepted', () => {
	const accepted: InviteAnswer = { accepted: true };
	const refused: InviteAnswer = { accepted: false };
	const full: InviteAnswer = { accepted: false, reason: 'family-full' };

	it.each<[string, InviteAnswer, boolean]>([
		['an accepted answer', accepted, false],
		['a plain refusal', refused, true],
		['a family-full refusal', full, true]
	])('%s → isInviteRefusal %s', (_what, answer, expected) => {
		expect(isInviteRefusal(answer)).toBe(expected);
	});

	it('answers 400 with one copy for unknown, expired, used-up and already-a-member', () => {
		expect(inviteRefusalCopy({ accepted: false })).toEqual({
			status: 400,
			message: 'Invalid, expired, or already used invite code'
		});
	});

	it('answers 403 only for the family-size cap', () => {
		expect(inviteRefusalCopy({ accepted: false, reason: 'family-full' })).toEqual({
			status: 403,
			message: 'This family is full. The subscription member limit does not allow more members.'
		});
	});
});
