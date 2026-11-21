/**
 * `FamilyCreateState` in node: the picker's debounce and exclusion, the picks,
 * the preview's inputs and the submit acknowledgement. Fake api, real
 * `memoryToasts()` and `manualScheduler()` for the debounce.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { memoryToasts } from '$lib/kernel/client/toasts.svelte.js';
import { manualScheduler } from '$lib/kernel/testing/manualScheduler';
import type { FamilyApi } from './family.api';
import type { MemberSearchHit } from './family.contract';
import { DEFAULT_FAMILY_COLOR } from './family.palette.rules';
import { FamilyCreateState, familyCreateConfirmed } from './family.create.state.svelte.js';

const MAYA: MemberSearchHit = { id: 'u-maya', firstName: 'Maya', lastName: 'Lopez', email: 'm***@x.com' };
const SAM: MemberSearchHit = { id: 'u-sam', firstName: 'Sam', lastName: 'Rivera', email: 's***@x.com' };

function api(
	search: (q: string, exclude: readonly string[]) => Promise<{ users: MemberSearchHit[] } | null>
): FamilyApi {
	return {
		searchMembers: async (q, exclude) => {
			const answer = await search(q, exclude ?? []);
			return answer
				? { ok: true, data: { users: answer.users } }
				: { ok: false, status: 0, error: 'Network problem. Try again.' };
		},
		searchInvitableMembers: () => Promise.resolve({ ok: true, data: { users: [] } }),
		addDirect: () => Promise.reject(new Error('unused')),
		addChild: () => Promise.reject(new Error('unused')),
		sendInviteEmail: () => Promise.reject(new Error('unused')),
		mintInviteLink: () => Promise.reject(new Error('unused')),
		mintInvite: () => Promise.reject(new Error('unused')),
		revokeInvite: () => Promise.reject(new Error('unused')),
		joinFamily: () => Promise.reject(new Error('unused'))
	};
}

describe('FamilyCreateState search', () => {
	it('does not spend a request on a term under two characters', () => {
		const manual = manualScheduler();
		const state = new FamilyCreateState(
			api(async () => ({ users: [] })),
			memoryToasts(),
			{ color: DEFAULT_FAMILY_COLOR },
			manual.schedule
		);
		state.setQuery('m');
		expect(manual.tasks).toHaveLength(0);
		state.setQuery('ma');
		expect(manual.tasks).toHaveLength(1);
	});

	it('excludes everybody already picked from the next search', async () => {
		const seen: string[][] = [];
		const state = new FamilyCreateState(
			api(async (_q, exclude) => {
				seen.push([...exclude]);
				return { users: [SAM] };
			}),
			memoryToasts(),
			{ color: DEFAULT_FAMILY_COLOR }
		);
		state.add(MAYA);
		await state.search('sa');
		expect(seen).toEqual([['u-maya']]);
		expect(state.results).toEqual([SAM]);
		expect(state.searchedFor).toBe('sa');
	});

	it('says the search failed instead of "no account by that name"', async () => {
		const state = new FamilyCreateState(
			api(async () => null),
			memoryToasts(),
			{ color: DEFAULT_FAMILY_COLOR }
		);
		await state.search('zz');
		expect(state.searchFailed).toBe(true);
		expect(state.results).toEqual([]);
	});
});

describe('FamilyCreateState picks', () => {
	it('moves a pick into the strip and clears the box', () => {
		const state = new FamilyCreateState(
			api(async () => ({ users: [] })),
			memoryToasts(),
			{ color: DEFAULT_FAMILY_COLOR }
		);
		state.query = 'ma';
		state.results = [MAYA];
		state.add(MAYA);
		expect(state.picked).toEqual([MAYA]);
		expect(state.query).toBe('');
		expect(state.results).toEqual([]);
	});

	it('never picks the same person twice', () => {
		const state = new FamilyCreateState(
			api(async () => ({ users: [] })),
			memoryToasts(),
			{ color: DEFAULT_FAMILY_COLOR }
		);
		state.add(MAYA);
		state.add(MAYA);
		expect(state.picked).toHaveLength(1);
	});

	it('drops a pick on remove', () => {
		const state = new FamilyCreateState(
			api(async () => ({ users: [] })),
			memoryToasts(),
			{ color: DEFAULT_FAMILY_COLOR }
		);
		state.add(MAYA);
		state.add(SAM);
		state.remove('u-maya');
		expect(state.picked.map((person) => person.id)).toEqual(['u-sam']);
	});
});

describe('FamilyCreateState submit', () => {
	it('confirms a created family by its typed name', () => {
		const toasts = memoryToasts();
		const state = new FamilyCreateState(api(async () => ({ users: [] })), toasts, {
			name: ' Rivera Home ',
			color: DEFAULT_FAMILY_COLOR
		});
		state.beginSubmit();
		expect(state.submitting).toBe(true);
		state.finishSubmit('redirect');
		expect(state.submitting).toBe(false);
		expect(toasts.items).toEqual([
			{ kind: 'success', text: 'Rivera Home created — opening it now' }
		]);
	});

	it('falls back to "Your family" when the name is blank', () => {
		const toasts = memoryToasts();
		const state = new FamilyCreateState(api(async () => ({ users: [] })), toasts, {
			name: '',
			color: DEFAULT_FAMILY_COLOR
		});
		state.finishSubmit('success');
		expect(toasts.items).toEqual([{ kind: 'success', text: 'Your family created — opening it now' }]);
	});

	it('says nothing when the action refused', () => {
		const toasts = memoryToasts();
		const state = new FamilyCreateState(api(async () => ({ users: [] })), toasts, {
			name: 'Rivera Home',
			color: DEFAULT_FAMILY_COLOR
		});
		state.finishSubmit('failure');
		expect(toasts.items).toEqual([]);
	});

	it('only a redirect or a success confirms a create', () => {
		expect(familyCreateConfirmed('redirect')).toBe(true);
		expect(familyCreateConfirmed('success')).toBe(true);
		expect(familyCreateConfirmed('failure')).toBe(false);
		expect(familyCreateConfirmed('error')).toBe(false);
	});
});
