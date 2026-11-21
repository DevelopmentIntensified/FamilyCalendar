/**
 * `FamilyHomeState` in node: the mint acknowledgement and toast, a refusal's
 * copy, the link that belongs to one family only, and the copy ladder for the
 * minted link and the rail code. Fake api + `memoryToasts()` + fake copy.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { memoryToasts } from '$lib/kernel/client/toasts.svelte.js';
import type { ApiResult } from '$lib/kernel/client/apiClient';
import type { FamilyApi } from './family.api';
import type { MintInviteResponse } from './family.contract';
import { FamilyHomeState } from './family.home.state.svelte.js';

type MintAnswer = ApiResult<MintInviteResponse>;

function api(mint: (familyId: string) => Promise<MintAnswer>): FamilyApi {
	return {
		mintInvite: (familyId) => mint(familyId),
		searchMembers: () => Promise.resolve({ ok: true, data: { users: [] } }),
		searchInvitableMembers: () => Promise.resolve({ ok: true, data: { users: [] } }),
		addDirect: () => Promise.resolve({ ok: true, data: { success: true } }),
		addChild: () => Promise.reject(new Error('unused')),
		sendInviteEmail: () => Promise.reject(new Error('unused')),
		mintInviteLink: () => Promise.reject(new Error('unused')),
		revokeInvite: () => Promise.resolve({ ok: true, data: { success: true } }),
		joinFamily: () => Promise.resolve({ ok: true, data: { success: true } })
	};
}

const MINTED: MintInviteResponse = {
	code: 'HOP-1',
	expiresAt: '2026-12-01T00:00:00.000Z',
	inviteUrl: '/family/join/HOP-1'
};

describe('FamilyHomeState.mint', () => {
	it('shows the link under its own family and toasts what can be sent', async () => {
		const toasts = memoryToasts();
		const state = new FamilyHomeState(
			api(() => Promise.resolve({ ok: true, data: MINTED })),
			toasts,
			() => Promise.resolve('copied')
		);
		await state.mint('fam-1', 'Rivera Home');
		expect(state.mintingId).toBe('');
		expect(state.minted).toEqual({ familyId: 'fam-1', code: 'HOP-1', url: '/family/join/HOP-1' });
		expect(state.linkFor('fam-1')).toBe('/family/join/HOP-1');
		expect(state.linkFor('fam-2')).toBe('');
		expect(toasts.items).toEqual([
			{
				kind: 'success',
				text: 'Join link ready for Rivera Home — send it to them; it admits 10 people for 7 days.'
			}
		]);
	});

	it('explains a refusal and shows no link', async () => {
		const toasts = memoryToasts();
		const state = new FamilyHomeState(
			api(() => Promise.resolve({ ok: false, status: 403, error: 'Not allowed' })),
			toasts,
			() => Promise.resolve('copied')
		);
		await state.mint('fam-1', 'Rivera Home');
		expect(state.minted).toBeNull();
		expect(toasts.items).toEqual([
			{ kind: 'error', text: "Couldn't make a join link for Rivera Home — try again." }
		]);
	});
});

describe('FamilyHomeState copy', () => {
	it('copies the minted link with the family title, and marks the row', async () => {
		const calls: { text: string; title: string }[] = [];
		const state = new FamilyHomeState(
			api(() => Promise.resolve({ ok: true, data: MINTED })),
			memoryToasts(),
			(text, title) => {
				calls.push({ text, title });
				return Promise.resolve('copied');
			}
		);
		await state.mint('fam-1', 'Rivera Home');
		await state.copyMinted('https://fam.example', 'fam-1', 'Rivera Home');
		expect(calls).toEqual([
			{ text: 'https://fam.example/family/join/HOP-1', title: 'Join Rivera Home' }
		]);
		expect(state.copiedFamilyId).toBe('fam-1');
		expect(state.copyFailedFamilyId).toBe('');
	});

	it('marks the rail code and toasts the failure honestly', async () => {
		const toasts = memoryToasts();
		const state = new FamilyHomeState(
			api(() => Promise.reject(new Error('unused'))),
			toasts,
			() => Promise.resolve('failed')
		);
		await state.copyCode('https://fam.example', 'HOP-2');
		expect(state.railCopiedCode).toBe('');
		expect(state.railCopyFailedCode).toBe('HOP-2');
		expect(toasts.items).toEqual([
			{
				kind: 'error',
				text: "Couldn't copy the join link — select it and copy it by hand."
			}
		]);
	});

	it('says nothing when the share sheet was cancelled', async () => {
		const toasts = memoryToasts();
		const state = new FamilyHomeState(
			api(() => Promise.reject(new Error('unused'))),
			toasts,
			() => Promise.resolve('cancelled')
		);
		await state.copyCode('https://fam.example', 'HOP-2');
		expect(state.railCopiedCode).toBe('');
		expect(state.railCopyFailedCode).toBe('');
		expect(toasts.items).toEqual([]);
	});
});
