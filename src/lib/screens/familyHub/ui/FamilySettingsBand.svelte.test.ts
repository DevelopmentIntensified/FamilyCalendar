/**
 * The Family Settings band: the seeded name and colour, the six named
 * swatches plus the free input, the colour copy, Save Changes and the Day
 * Dashboard Modules list.
 *
 * Doc: ../../README.md#invariants
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { memoryToasts } from '$lib/kernel/client/toasts.svelte';
import { FAMILY_PALETTE } from '$lib/domains/family/index';
import { FamilyHubState, familyHubPlainForm } from '../familyHub.detail.state.svelte';
import { buildFamilyHubModel } from '../familyHub.ui.fixtures';
import FamilySettingsBand from './FamilySettingsBand.svelte';

afterEach(cleanup);

function band() {
	const state = new FamilyHubState({
		toasts: memoryToasts(),
		refresh: async () => {},
		data: buildFamilyHubModel(),
		fallbackColor: '#c45e38'
	});
	render(FamilySettingsBand, { props: { state, enhance: familyHubPlainForm } });
	return state;
}

describe('FamilySettingsBand', () => {
	it('seeds the name and colour from the family', () => {
		band();
		expect((screen.getByLabelText('Family Name') as HTMLInputElement).value).toBe('Old Home');
		expect((screen.getByLabelText('Family colour') as HTMLInputElement).value).toBe('#c45e38');
	});

	it('offers the six named swatches and marks the current one', () => {
		band();
		const swatches = screen.getAllByRole('button', { name: /^Set colour / });
		expect(swatches).toHaveLength(FAMILY_PALETTE.length);
		expect(screen.getByRole('button', { name: 'Set colour Terracotta' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
	});

	it('picking a swatch changes the colour field', async () => {
		const state = band();
		await fireEvent.click(screen.getByRole('button', { name: 'Set colour Sage' }));
		expect(state.editingColor).toBe('#4d9c85');
	});

	it('keeps the approved colour copy and the Save label', () => {
		band();
		expect(
			screen.getByText('Colour tints the calendar, the members and the family calendar chip.')
		).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Save Changes' })).toBeTruthy();
	});

	it('lists the family-wide Day Dashboard Modules with the switch copy', () => {
		band();
		expect(screen.getByText('Day Dashboard Modules')).toBeTruthy();
		expect(screen.getByText('Family Task Board')).toBeTruthy();
		expect(screen.getByText("Kids' Schedule")).toBeTruthy();
		expect(screen.getByText('Groceries')).toBeTruthy();
		expect(screen.getByText('Meals')).toBeTruthy();
	});
});
