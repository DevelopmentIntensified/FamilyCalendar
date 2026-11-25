/**
 * The detail page's side rail, visible to every member: Shared data, the live
 * invitation, the plan (or "No plan"), and "Children are users".
 *
 * Doc: ../../README.md#invariants
 */
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { memoryToasts } from '$lib/kernel/client/toasts.svelte';
import { FamilyHubState } from '../familyHub.detail.state.svelte';
import { buildFamilyHubModel } from '../familyHub.ui.fixtures';
import SideRail from './SideRail.svelte';

afterEach(cleanup);

function rail(overrides: Parameters<typeof buildFamilyHubModel>[0] = {}) {
	const state = new FamilyHubState({
		toasts: memoryToasts(),
		refresh: async () => {},
		data: buildFamilyHubModel(overrides),
		fallbackColor: '#c45e38'
	});
	render(SideRail, { props: { state } });
	return state;
}

describe('SideRail', () => {
	it('carries the four Shared data doors', () => {
		rail();
		expect(screen.getByText('Shared data')).toBeTruthy();
		expect(screen.getByRole('link', { name: /Family tasks/ })).toBeTruthy();
		expect(screen.getByRole('link', { name: /Grocery list/ })).toBeTruthy();
		expect(screen.getByRole('link', { name: /Family calendar/ })).toBeTruthy();
		expect(screen.getByRole('link', { name: /Invitations/ })).toBeTruthy();
	});

	it('names the live invitation with its uses', () => {
		rail();
		expect(screen.getByText('LIVE000001')).toBeTruthy();
		expect(screen.getByText('2 of 5')).toBeTruthy();
		expect(screen.getByText('Ann')).toBeTruthy();
	});

	it('says there is no invitation and offers a join link to an admin', () => {
		rail({ activeInvite: null, inviteCreatedBy: null });
		expect(
			screen.getByText('No active invitation. Mint a link to bring somebody into this family.')
		).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Get a join link' })).toBeTruthy();
	});

	it('says "No plan" rather than naming a tier the user does not have', () => {
		rail({
			planUsage: { ...buildFamilyHubModel().planUsage, tierName: null }
		});
		expect(screen.getByText('No plan')).toBeTruthy();
		expect(screen.queryByText('Full House')).toBeNull();
	});

	it('prints the plan numbers and the tier it does have', () => {
		rail();
		expect(screen.getByText('Full House')).toBeTruthy();
		expect(screen.getByText('3/10')).toBeTruthy();
		expect(screen.getByText('1 of 1')).toBeTruthy();
		expect(screen.getByText('2 of 6')).toBeTruthy();
		expect(screen.getByText('30 days')).toBeTruthy();
		expect(screen.getByText('enabled')).toBeTruthy();
		expect(screen.getByText('Children are users')).toBeTruthy();
	});
});
