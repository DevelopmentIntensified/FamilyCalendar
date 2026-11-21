/**
 * The add-member page's four state classes in node: the tab/success shell, the
 * debounced search + direct add, the invite form's send/mint/copy, and the
 * child form's consent. Fake api and `manualScheduler()`; no DOM.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { manualScheduler } from '$lib/kernel/testing/manualScheduler';
import type { FamilyApi } from './family.api';
import type { MemberSearchHit } from './family.contract';
import {
	FamilyAddMemberState,
	FamilyChildFormState,
	FamilyInviteFormState,
	FamilyMemberSearchState
} from './family.addMember.state.svelte.js';

const MAYA: MemberSearchHit = {
	id: 'u-maya',
	firstName: 'Maya',
	lastName: 'Lopez',
	email: 'm***@x.com'
};
const SAM: MemberSearchHit = {
	id: 'u-sam',
	firstName: 'Sam',
	lastName: 'Rivera',
	email: 's***@x.com'
};

function api(overrides: Partial<FamilyApi> = {}): FamilyApi {
	return {
		searchMembers: () => Promise.reject(new Error('unused')),
		searchInvitableMembers: () => Promise.resolve({ ok: true, data: { users: [MAYA, SAM] } }),
		addDirect: () => Promise.resolve({ ok: true, data: { success: true } }),
		addChild: () =>
			Promise.resolve({ ok: true, data: { success: true, user: { id: 'u-1', firstName: 'Mia', lastName: 'R', email: 'm@x.com' } } }),
		sendInviteEmail: () => Promise.resolve({ ok: true, data: { success: true } }),
		mintInviteLink: () =>
			Promise.resolve({ ok: true, data: { success: true, link: 'https://fam.example/family/join/ABC' } }),
		mintInvite: () => Promise.reject(new Error('unused')),
		revokeInvite: () => Promise.reject(new Error('unused')),
		joinFamily: () => Promise.reject(new Error('unused')),
		...overrides
	};
}

describe('FamilyAddMemberState', () => {
	it('opens on Find someone and clears the error when the tab changes', () => {
		const page = new FamilyAddMemberState();
		expect(page.mode).toBe('search');
		page.fail('Nope');
		page.selectMode('child');
		expect(page.mode).toBe('child');
		expect(page.error).toBe('');
	});

	it('says an emailed invite added nobody yet', () => {
		const page = new FamilyAddMemberState();
		page.added('new@example.com');
		expect(page.success).toBe(true);
		expect(page.successCopy.heading).toBe('Invite sent');
		expect(page.successCopy.body).toContain('new@example.com');
	});

	it('confirms a member who really joined', () => {
		const page = new FamilyAddMemberState();
		page.added();
		expect(page.invitedEmail).toBeNull();
		expect(page.successCopy.heading).toBe('Member Added!');
	});
});

describe('FamilyMemberSearchState', () => {
	it('does not search a single character', () => {
		const manual = manualScheduler();
		const state = new FamilyMemberSearchState(api(), 'fam-1', () => {}, manual.schedule);
		state.setQuery('m');
		expect(manual.tasks).toHaveLength(0);
		state.setQuery('ma');
		expect(manual.tasks).toHaveLength(1);
	});

	it('finds people in this family and confirms one before adding', async () => {
		const added: string[] = [];
		const state = new FamilyMemberSearchState(
			api({
				addDirect: async (_familyId, userId) => {
					added.push(userId);
					return { ok: true, data: { success: true } };
				}
			}),
			'fam-1',
			() => {}
		);
		await state.search();
		expect(state.results.map((user) => user.id)).toEqual(['u-maya', 'u-sam']);
		state.select(MAYA);
		expect(state.selected?.id).toBe('u-maya');
		expect(state.results).toEqual([]);
		expect(await state.add()).toEqual({ ok: true });
		expect(added).toEqual(['u-maya']);
	});

	it('answers the door\'s refusal copy', async () => {
		const state = new FamilyMemberSearchState(
			api({
				addDirect: async () => ({ ok: false, status: 400, error: 'User is already a member of this family' })
			}),
			'fam-1',
			() => {}
		);
		state.select(SAM);
		expect(await state.add()).toEqual({
			ok: false,
			error: 'User is already a member of this family'
		});
	});

	it('reports a search that never reached the server', async () => {
		const errors: string[] = [];
		const state = new FamilyMemberSearchState(
			api({
				searchInvitableMembers: async () => ({ ok: false, status: 0, error: 'Network problem. Try again.' })
			}),
			'fam-1',
			(message) => errors.push(message)
		);
		await state.search();
		expect(errors).toEqual(['Network problem. Please try again.']);
		expect(state.results).toEqual([]);
	});
});

describe('FamilyInviteFormState', () => {
	it('needs an address and both names before it offers a link', () => {
		const state = new FamilyInviteFormState(api(), 'fam-1', () => Promise.resolve('copied'));
		expect(state.complete).toBe(false);
		state.email = 'a@b.com';
		state.firstName = 'Ann';
		expect(state.complete).toBe(false);
		state.lastName = 'Lee';
		expect(state.complete).toBe(true);
	});

	it('sends the invite with the typed names', async () => {
		const sent: string[][] = [];
		const state = new FamilyInviteFormState(
			api({
				sendInviteEmail: async (familyId, form) => {
					sent.push([familyId, form.email, form.firstName, form.lastName]);
					return { ok: true, data: { success: true } };
				}
			}),
			'fam-1',
			() => Promise.resolve('copied')
		);
		state.email = 'new@example.com';
		state.firstName = 'Ann';
		state.lastName = 'Lee';
		expect(await state.send()).toEqual({ ok: true });
		expect(sent).toEqual([['fam-1', 'new@example.com', 'Ann', 'Lee']]);
		expect(state.sending).toBe(false);
	});

	it('mints and copies the shareable link for those names', async () => {
		const copied: string[] = [];
		const state = new FamilyInviteFormState(api(), 'fam-1', (text) => {
			copied.push(text);
			return Promise.resolve('copied');
		});
		state.email = 'new@example.com';
		state.firstName = 'Ann';
		state.lastName = 'Lee';
		expect(await state.mintLink()).toEqual({ ok: true });
		expect(state.link).toBe('https://fam.example/family/join/ABC');
		await state.copyLink();
		expect(copied).toEqual(['https://fam.example/family/join/ABC']);
		expect(state.copiedLink).toBe(true);
	});
});

describe('FamilyChildFormState', () => {
	it('creates the child with the consent it was given', async () => {
		const sent: boolean[] = [];
		const state = new FamilyChildFormState(
			api({
				addChild: async (_familyId, form) => {
					sent.push(form.consentAcknowledged);
					return { ok: true, data: { success: true, user: { id: 'u-1', firstName: 'Mia', lastName: 'R', email: 'm@x.com' } } };
				}
			}),
			'fam-1'
		);
		state.firstName = 'Mia';
		state.lastName = 'Rivera';
		state.email = 'm@x.com';
		state.consentAcknowledged = true;
		expect(await state.create()).toEqual({ ok: true });
		expect(sent).toEqual([true]);
	});

	it('answers the consent refusal', async () => {
		const state = new FamilyChildFormState(
			api({
				addChild: async () => ({
					ok: false,
					status: 400,
					error: 'Please confirm you are this child’s parent or guardian and consent to creating their account.'
				})
			}),
			'fam-1'
		);
		expect(await state.create()).toEqual({
			ok: false,
			error: 'Please confirm you are this child’s parent or guardian and consent to creating their account.'
		});
	});
});
