/**
 * The `/family/invitations` page's rules: the validity offer, which code is
 * "live", the use-slot strip, the meta line and the toast copy. The clamps and
 * the accept transaction stay in `family.invites.rules.ts` / the service.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import type { InviteCodeView } from './family.contract';
import {
	FAMILY_COPY_FAILED_COPY,
	FAMILY_INVITE_DEFAULT_DAYS,
	FAMILY_INVITE_DEFAULT_USES,
	FAMILY_MAX_USES_MAX,
	FAMILY_MAX_USES_MIN,
	FAMILY_MEMBER_INVITES_NOTICE,
	FAMILY_VALIDITY_CHOICES,
	familyCodeRevokedToast,
	familyInviteMetaLabel,
	familyInviteUseSlots,
	familyLiveInvite,
	familyNewCodeToast,
	familyOtherInvites
} from './family.invitations.rules';

const NOW = new Date('2026-11-21T09:00:00.000Z');

function code(overrides: Partial<InviteCodeView> & { code: string }): InviteCodeView {
	return {
		code: overrides.code,
		familyId: 'fam-1',
		expiresAt: overrides.expiresAt ?? new Date('2026-12-01T00:00:00.000Z'),
		maxUses: overrides.maxUses === undefined ? 5 : overrides.maxUses,
		useCount: overrides.useCount === undefined ? 1 : overrides.useCount,
		createdBy: null
	};
}

describe('the New-code offer', () => {
	it('offers the approved three validity windows in order', () => {
		expect(FAMILY_VALIDITY_CHOICES.map((choice) => [choice.label, choice.days])).toEqual([
			['7 days', 7],
			['24 hours', 1],
			['30 days', 30]
		]);
	});

	it('starts at the page defaults and keeps the prototype\'s maxima', () => {
		expect(FAMILY_INVITE_DEFAULT_DAYS).toBe(7);
		expect(FAMILY_INVITE_DEFAULT_USES).toBe(10);
		expect(FAMILY_MAX_USES_MIN).toBe(1);
		expect(FAMILY_MAX_USES_MAX).toBe(20);
	});
});

describe('familyLiveInvite', () => {
	it('picks the first usable code', () => {
		const spent = code({ code: 'SPENT', useCount: 5, maxUses: 5 });
		const live = code({ code: 'LIVE' });
		expect(familyLiveInvite([spent, live], NOW)?.code).toBe('LIVE');
	});

	it('treats an expired or used-up code as not live', () => {
		const expired = code({ code: 'OLD', expiresAt: new Date('2026-01-01T00:00:00.000Z') });
		const used = code({ code: 'USED', useCount: 2, maxUses: 2 });
		expect(familyLiveInvite([expired, used], NOW)).toBeNull();
	});
});

describe('familyOtherInvites', () => {
	it('lists every code but the live one', () => {
		const live = code({ code: 'LIVE' });
		const other = code({ code: 'SPENT', useCount: 5, maxUses: 5 });
		expect(familyOtherInvites([other, live], live).map((invite) => invite.code)).toEqual(['SPENT']);
		expect(familyOtherInvites([other], null)).toEqual([other]);
	});
});

describe('familyInviteUseSlots', () => {
	it('draws one segment per allowed use, the spent ones first', () => {
		expect(familyInviteUseSlots({ useCount: 2, maxUses: 5 })).toEqual([
			'used',
			'used',
			'free',
			'free',
			'free'
		]);
	});

	it('draws nothing for a code with no ceiling', () => {
		expect(familyInviteUseSlots({ useCount: 3, maxUses: null })).toEqual([]);
	});

	it('treats a missing use count as none spent', () => {
		expect(familyInviteUseSlots({ useCount: null, maxUses: 2 })).toEqual(['free', 'free']);
	});
});

describe('familyInviteMetaLabel', () => {
	it('prints the uses and the expiry the rail shows', () => {
		const invite = code({ code: 'LIVE', useCount: 2, maxUses: 5 });
		expect(familyInviteMetaLabel(invite)).toBe(
			`2 of 5 used · expires ${invite.expiresAt.toLocaleDateString()}`
		);
	});

	it('prints ∞ for a code with no use limit', () => {
		expect(familyInviteMetaLabel(code({ code: 'OPEN', useCount: 0, maxUses: null }))).toContain(
			'0 of ∞ used'
		);
	});
});

describe('the page copy', () => {
	it('names the code in the mint toast', () => {
		expect(familyNewCodeToast('HOP-1')).toBe(
			'New code HOP-1 is live — send it to whoever you are inviting.'
		);
	});

	it('spells out what a revoke does', () => {
		expect(familyCodeRevokedToast('HOP-1')).toBe(
			'HOP-1 revoked — anybody still holding the link is now locked out.'
		);
	});

	it('tells a plain member why there is no UI', () => {
		expect(FAMILY_MEMBER_INVITES_NOTICE).toBe(
			'Only the family creator or an admin can manage invitations.'
		);
	});

	it('keeps the copy-failure line', () => {
		expect(FAMILY_COPY_FAILED_COPY).toBe(
			'Copy failed — select the link above and copy it manually.'
		);
	});
});
