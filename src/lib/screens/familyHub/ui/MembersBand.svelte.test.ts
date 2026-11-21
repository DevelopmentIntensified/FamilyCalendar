/**
 * The Members band as the reader sees it: the header count and links, one row
 * per member, and Edit/Remove offered only on OTHER members (never self, never
 * a creator).
 *
 * Doc: ../../README.md#invariants
 */
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { memoryToasts } from '$lib/kernel/client/toasts.svelte';
import {
	FamilyHubState,
	familyHubPlainForm
} from '../familyHub.detail.state.svelte';
import { buildFamilyHubModel } from '../familyHub.ui.fixtures';
import MembersBand from './MembersBand.svelte';

afterEach(cleanup);

function band(overrides: Parameters<typeof buildFamilyHubModel>[0] = {}) {
	const state = new FamilyHubState({
		toasts: memoryToasts(),
		refresh: async () => {},
		data: buildFamilyHubModel(overrides),
		fallbackColor: '#c45e38'
	});
	render(MembersBand, {
		props: { state, enhance: familyHubPlainForm, onOpenSheet: () => {} }
	});
	return state;
}

describe('MembersBand', () => {
	it('reads "N of {memberLimit}" and carries the two family links', () => {
		band();
		expect(screen.getByText('2 of 6')).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Family Tasks' })).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Groceries' })).toBeTruthy();
		expect(screen.getByRole('link', { name: '+ Add a member' })).toBeTruthy();
	});

	it('gates Edit and Remove to other members only', () => {
		band();
		// The viewer (Ann, the creator) is in the roster but gets neither control.
		expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(1);
		expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(1);
	});

	it('offers a Member Type select to admins, one per member', () => {
		band();
		expect(screen.getAllByRole('combobox', { name: /Member type for/ })).toHaveLength(2);
	});

	it('gives a plain member the Member Type as a pill, not a select', () => {
		band({ currentUserRole: 'member', currentUserId: 'u_bob' });
		expect(screen.queryAllByRole('combobox', { name: /Member type for/ })).toHaveLength(0);
		expect(screen.queryByRole('link', { name: '+ Add a member' })).toBeNull();
	});
});
