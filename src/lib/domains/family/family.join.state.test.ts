/**
 * `FamilyJoinState` in node: the join button's pending flag, the welcome panel
 * with its scheduled redirect, the server's refusal copy and the page's own
 * sentence for a request that never arrived.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { manualScheduler } from '$lib/kernel/testing/manualScheduler';
import type { FamilyApi } from './family.api';
import { FamilyJoinState } from './family.join.state.svelte.js';

function api(join: FamilyApi['joinFamily']): FamilyApi {
	return {
		joinFamily: join,
		searchMembers: () => Promise.reject(new Error('unused')),
		searchInvitableMembers: () => Promise.reject(new Error('unused')),
		addDirect: () => Promise.reject(new Error('unused')),
		addChild: () => Promise.reject(new Error('unused')),
		sendInviteEmail: () => Promise.reject(new Error('unused')),
		mintInviteLink: () => Promise.reject(new Error('unused')),
		mintInvite: () => Promise.reject(new Error('unused')),
		revokeInvite: () => Promise.reject(new Error('unused'))
	};
}

describe('FamilyJoinState.join', () => {
	it('welcomes the person and then leaves for the family page', async () => {
		const manual = manualScheduler();
		const redirected: string[] = [];
		const state = new FamilyJoinState(
			api(async () => ({ ok: true, data: { success: true } })),
			'HOP-1',
			() => redirected.push('family'),
			manual.schedule
		);
		await state.join();
		expect(state.success).toBe(true);
		expect(state.joining).toBe(false);
		expect(redirected).toEqual([]);
		manual.fireAll();
		expect(redirected).toEqual(['family']);
	});

	it('keeps the page and shows the server\'s refusal', async () => {
		const state = new FamilyJoinState(
			api(async () => ({ ok: false, status: 400, error: 'Invalid, expired, or already used invite code' })),
			'HOP-1',
			() => {}
		);
		await state.join();
		expect(state.success).toBe(false);
		expect(state.error).toBe('Invalid, expired, or already used invite code');
	});

	it('uses the page\'s own sentence when the request never arrived', async () => {
		const state = new FamilyJoinState(
			api(async () => ({ ok: false, status: 0, error: 'Network problem. Try again.' })),
			'HOP-1',
			() => {}
		);
		await state.join();
		expect(state.error).toBe('We could not reach the server. Check your connection and try again.');
	});
});
