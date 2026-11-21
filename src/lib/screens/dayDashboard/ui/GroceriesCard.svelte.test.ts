/**
 * Groceries: the two scopes, the store chips, `+N more` after three names, and
 * the empty-state link (`family` only when a family exists). Props only.
 *
 * Doc: ../README.md#invariants
 */
import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import GroceriesCard from './GroceriesCard.svelte';

afterEach(cleanup);

describe('GroceriesCard', () => {
	it('without a family it points at Mine, not at a list that cannot exist', () => {
		render(GroceriesCard, { props: { familyItems: [], mineItems: [], hasFamily: false } });
		expect(screen.getByText('Nothing on the list yet.')).toBeTruthy();
		expect(screen.getByTestId('groceries-link')).toHaveAttribute(
			'href',
			'/calendar/groceries?scope=mine'
		);
	});

	it('with a family the empty-state link goes to the family list', () => {
		render(GroceriesCard, { props: { familyItems: [], mineItems: [], hasFamily: true } });
		expect(screen.getByTestId('groceries-link')).toHaveAttribute(
			'href',
			'/calendar/groceries?scope=family'
		);
	});

	it('prints the open total, one section per non-empty scope, and +N more after three', () => {
		render(GroceriesCard, {
			props: {
				hasFamily: true,
				familyItems: [
					{ name: 'Milk', stores: ['Costco'] },
					{ name: 'Bread', stores: ['Costco'] },
					{ name: 'Eggs', stores: [] },
					{ name: 'Apples', stores: [] }
				],
				mineItems: [{ name: 'Coffee', stores: [] }]
			}
		});
		expect(screen.getByTestId('groceries-open-total').textContent).toContain('5 open');
		expect(screen.getByTestId('groceries-scope-family').textContent).toContain(
			'Milk, Bread, Eggs, +1 more'
		);
		expect(screen.getByTestId('groceries-scope-mine').textContent).toContain('Coffee');
		expect(screen.getByText('Costco')).toBeTruthy();
	});

	it('hides the family scope for a solo account even when the list is populated', () => {
		render(GroceriesCard, {
			props: { hasFamily: false, familyItems: [{ name: 'Milk', stores: [] }], mineItems: [] }
		});
		expect(screen.queryByTestId('groceries-scope-family')).toBeNull();
		expect(screen.getByText('Nothing on the list yet.')).toBeTruthy();
	});
});
