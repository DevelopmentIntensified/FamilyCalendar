/**
 * `FamilyInvitationsState` in node: the mint and revoke acknowledgements, the
 * refusal banner, the refresh after a change and the copy confirmation that
 * clears itself. Fake api + fake refresh + `manualScheduler()`.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { memoryToasts } from '$lib/kernel/client/toasts.svelte.js';
import { manualScheduler } from '$lib/kernel/testing/manualScheduler';
import type { ApiResult } from '$lib/kernel/client/apiClient';
import type { FamilyApi } from './family.api';
import type { MintInviteResponse } from './family.contract';
import { FamilyInvitationsState } from './family.invitations.state.svelte.js';

type Ack = { success: true };

function api(overrides: {
	mint: (familyId: string, days: number, uses: number) => Promise<ApiResult<MintInviteResponse>>;
	revoke: (code: string) => Promise<ApiResult<Ack>>;
}): FamilyApi {
	return {
		mintInvite: overrides.mint,
		revokeInvite: overrides.revoke,
		searchMembers: () => Promise.reject(new Error('unused')),
		searchInvitableMembers: () => Promise.reject(new Error('unused')),
		addDirect: () => Promise.reject(new Error('unused')),
		addChild: () => Promise.reject(new Error('unused')),
		sendInviteEmail: () => Promise.reject(new Error('unused')),
		mintInviteLink: () => Promise.reject(new Error('unused')),
		joinFamily: () => Promise.reject(new Error('unused'))
	};
}

const MINTED: MintInviteResponse = {
	code: 'HOP-9',
	expiresAt: '2026-11-28T00:00:00.000Z',
	inviteUrl: '/family/join/HOP-9'
};

function stateWith(overrides: Parameters<typeof api>[0], refreshes: { count: number } = { count: 0 }) {
	const toasts = memoryToasts();
	const manual = manualScheduler();
	const state = new FamilyInvitationsState(
		api(overrides),
		toasts,
		async () => {
			refreshes.count += 1;
		},
		() => Promise.resolve('copied'),
		manual.schedule
	);
	return { state, toasts, manual, refreshes };
}

describe('FamilyInvitationsState.createCode', () => {
	it('mints with the band\'s numbers, refreshes and names the code', async () => {
		const sent: number[][] = [];
		const { state, toasts, refreshes } = stateWith({
			mint: async (_familyId, days, uses) => {
				sent.push([days, uses]);
				return { ok: true, data: MINTED };
			},
			revoke: () => Promise.resolve({ ok: true, data: { success: true } })
		});
		state.validityDays = 30;
		state.maxUses = 20;
		await state.createCode('fam-1');
		expect(sent).toEqual([[30, 20]]);
		expect(refreshes.count).toBe(1);
		expect(state.creating).toBe(false);
		expect(toasts.items).toEqual([
			{ kind: 'success', text: 'New code HOP-9 is live — send it to whoever you are inviting.' }
		]);
	});

	it('shows the refusal and toasts it', async () => {
		const { state, toasts, refreshes } = stateWith({
			mint: async () => ({ ok: false, status: 403, error: 'Only the family creator or an admin can create invitations' }),
			revoke: () => Promise.resolve({ ok: true, data: { success: true } })
		});
		await state.createCode('fam-1');
		expect(state.error).toBe('Only the family creator or an admin can create invitations');
		expect(refreshes.count).toBe(0);
		expect(toasts.items).toEqual([
			{
				kind: 'error',
				text: "Couldn't make a new code — Only the family creator or an admin can create invitations"
			}
		]);
	});
});

describe('FamilyInvitationsState.revoke', () => {
	it('acknowledges the row, refreshes and names the code', async () => {
		const { state, toasts, refreshes } = stateWith({
			mint: () => Promise.reject(new Error('unused')),
			revoke: () => Promise.resolve({ ok: true, data: { success: true } })
		});
		await state.revoke('HOP-1');
		expect(state.revokingCode).toBe('');
		expect(refreshes.count).toBe(1);
		expect(toasts.items).toEqual([
			{
				kind: 'success',
				text: 'HOP-1 revoked — anybody still holding the link is now locked out.'
			}
		]);
	});

	it('keeps the row and explains a refusal', async () => {
		const { state, toasts } = stateWith({
			mint: () => Promise.reject(new Error('unused')),
			revoke: async () => ({ ok: false, status: 404, error: 'Invite code not found' })
		});
		await state.revoke('HOP-1');
		expect(state.error).toBe('Invite code not found');
		expect(toasts.items).toEqual([
			{ kind: 'error', text: "Couldn't revoke HOP-1 — Invite code not found" }
		]);
	});
});

describe('FamilyInvitationsState.copyLink', () => {
	it('shows "Copied ✓" and resets it on the scheduler', async () => {
		const { state, manual } = stateWith({
			mint: () => Promise.reject(new Error('unused')),
			revoke: () => Promise.reject(new Error('unused'))
		});
		await state.copyLink('HOP-1', 'https://fam.example/family/join/HOP-1', 'Rivera Home');
		expect(state.copiedCode).toBe('HOP-1');
		expect(state.copyFailedCode).toBe('');
		manual.fireAll();
		expect(state.copiedCode).toBe('');
	});

	it('reports a failed copy against that code', async () => {
		const toasts = memoryToasts();
		const state = new FamilyInvitationsState(
			api({
				mint: () => Promise.reject(new Error('unused')),
				revoke: () => Promise.reject(new Error('unused'))
			}),
			toasts,
			() => Promise.resolve(),
			() => Promise.resolve('failed')
		);
		await state.copyLink('HOP-1', 'https://fam.example/x', 'Rivera Home');
		expect(state.copyFailedCode).toBe('HOP-1');
		expect(state.copiedCode).toBe('');
	});
});
