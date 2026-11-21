/**
 * The `/family/[familyId]/members/add` page's rules: which tabs show, the
 * failure ladder (issue 250) and the success panel's two faces (issue 249).
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import {
	FAMILY_ADD_NETWORK_FAILURE,
	FAMILY_ADD_TABS,
	familyAddFailure,
	familyAddSuccessCopy,
	familyCanInviteByEmail,
	familyVisibleAddTabs
} from './family.addMember.rules';

describe('the tab strip', () => {
	it('offers three ways in, in the approved order', () => {
		expect(FAMILY_ADD_TABS).toEqual(['search', 'invite', 'child']);
		expect(familyVisibleAddTabs(true)).toEqual(['search', 'invite', 'child']);
	});

	it('hides the invite tab from a plain member instead of refusing the click', () => {
		expect(familyVisibleAddTabs(false)).toEqual(['search', 'child']);
		expect(familyCanInviteByEmail('member')).toBe(false);
		expect(familyCanInviteByEmail(null)).toBe(false);
		expect(familyCanInviteByEmail('admin')).toBe(true);
		expect(familyCanInviteByEmail('creator')).toBe(true);
	});
});

describe('familyAddFailure', () => {
	it('reads the handled refusal first', () => {
		expect(familyAddFailure(false, { error: 'That email is already in use.' })).toBe(
			'That email is already in use.'
		);
	});

	it('falls back to a thrown server message on a non-2xx', () => {
		expect(familyAddFailure(false, { message: 'Internal Error' })).toBe('Internal Error');
	});

	it('never treats a non-2xx as success', () => {
		expect(familyAddFailure(false, null)).toBe('Something went wrong. Please try again.');
		expect(familyAddFailure(false, { message: '' })).toBe(
			'Something went wrong. Please try again.'
		);
	});

	it('answers null only for a success', () => {
		expect(familyAddFailure(true, { users: [] })).toBeNull();
		expect(familyAddFailure(true, undefined)).toBeNull();
	});
});

describe('familyAddSuccessCopy', () => {
	it('says an emailed invite was sent, not that somebody joined (issue 249)', () => {
		expect(familyAddSuccessCopy('new@example.com')).toEqual({
			heading: 'Invite sent',
			body: 'Invite sent to new@example.com — they join when they open it (expires in 24h).'
		});
	});

	it('confirms a member who really joined', () => {
		expect(familyAddSuccessCopy(null)).toEqual({
			heading: 'Member Added!',
			body: 'The new member has been added to your family.'
		});
	});
});

describe('the network sentence', () => {
	it('is the page\'s own, not the api client\'s', () => {
		expect(FAMILY_ADD_NETWORK_FAILURE).toBe('Network problem. Please try again.');
	});
});
