import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import GroceriesCard from './GroceriesCard.svelte';

afterEach(() => {
	cleanup();
});

const familyItems = [
	{ name: 'Whole milk', stores: ['Northside Market', 'Costco'] },
	{ name: 'Sourdough', stores: ['Corner Bakery'] },
	{ name: 'Eggs', stores: ['Northside Market'] },
	{ name: 'Lemons', stores: ['Trader Joe’s'] },
	{ name: 'Coffee beans', stores: ['Costco'] }
];

const mineItems = [
	{ name: 'Oat milk', stores: ['Costco'] },
	{ name: 'Granola', stores: ['Trader Joe’s'] }
];

function hrefs() {
	return Array.from(document.querySelectorAll('a')).map((a) => a.getAttribute('href'));
}

describe('GroceriesCard — what is on the list', () => {
	it('counts what is open across the list', () => {
		render(GroceriesCard, { props: { familyItems, mineItems, hasFamily: true } });
		expect(screen.getByTestId('groceries-card').textContent).toContain('7 open');
		expect(screen.getByTestId('groceries-scope-family').textContent).toContain('5 open');
		expect(screen.getByTestId('groceries-scope-mine').textContent).toContain('2 open');
	});

	it('names the stores the list spans', () => {
		render(GroceriesCard, { props: { familyItems, mineItems, hasFamily: true } });
		const family = screen.getByTestId('groceries-scope-family');
		for (const store of ['Costco', 'Corner Bakery', 'Northside Market', 'Trader Joe’s']) {
			expect(family.textContent).toContain(store);
		}
	});

	it('shows a few names and admits there are more', () => {
		render(GroceriesCard, { props: { familyItems, mineItems, hasFamily: true } });
		const family = screen.getByTestId('groceries-scope-family');
		expect(family.textContent).toContain('Whole milk');
		expect(family.textContent).toContain('+2 more');
		expect(family.textContent).not.toContain('Coffee beans');
	});

	it('links each scope to the groceries page filtered to it', () => {
		render(GroceriesCard, { props: { familyItems, mineItems, hasFamily: true } });
		expect(hrefs()).toContain('/calendar/groceries?scope=family');
		expect(hrefs()).toContain('/calendar/groceries?scope=mine');
	});
});

describe('GroceriesCard — a family with no list yet', () => {
	it('says so quietly instead of rendering an empty box', () => {
		render(GroceriesCard, { props: { familyItems: [], mineItems: [], hasFamily: true } });
		const card = screen.getByTestId('groceries-card');
		expect(card.textContent).toContain('Nothing on the list');
		expect(screen.queryByTestId('groceries-scope-family')).toBeNull();
		expect(card.textContent).not.toContain('0 open');
	});

	it('still offers the way in, at the right scope', () => {
		render(GroceriesCard, { props: { familyItems: [], mineItems: [], hasFamily: true } });
		expect(hrefs()).toContain('/calendar/groceries?scope=family');
	});

	it('without a family it points at Mine, not at a list that cannot exist', () => {
		render(GroceriesCard, { props: { familyItems: [], mineItems: [], hasFamily: false } });
		expect(hrefs()).toEqual(['/calendar/groceries?scope=mine']);
	});
});

describe('GroceriesCard — a list with only one scope', () => {
	it('shows Mine alone when the family list is empty', () => {
		render(GroceriesCard, { props: { familyItems: [], mineItems, hasFamily: true } });
		expect(screen.queryByTestId('groceries-scope-family')).toBeNull();
		expect(screen.getByTestId('groceries-scope-mine').textContent).toContain('2 open');
	});

	it('shows Mine alone for a user with no family', () => {
		render(GroceriesCard, { props: { familyItems, mineItems, hasFamily: false } });
		// No family means no Family list — showing it would be a lie.
		expect(screen.queryByTestId('groceries-scope-family')).toBeNull();
		expect(screen.getByTestId('groceries-scope-mine').textContent).toContain('2 open');
		expect(hrefs()).toEqual(['/calendar/groceries?scope=mine']);
	});

	it('marks items with no store as unassigned rather than hiding them', () => {
		render(GroceriesCard, {
			props: { familyItems: [{ name: 'Birthday candles', stores: [] }], mineItems: [], hasFamily: true }
		});
		expect(screen.getByTestId('groceries-scope-family').textContent).toContain('Any store');
	});
});

describe('GroceriesCard — no horizontal overflow at 320px', () => {
	it('wraps the store chips instead of widening the card', () => {
		render(GroceriesCard, {
			props: {
				familyItems: [
					{ name: 'An unusually long item name that will not fit on one line', stores: ['Northside Market', 'Costco', 'Aldi', 'Trader Joe’s'] }
				],
				mineItems: [],
				hasFamily: true
			}
		});
		const scope = screen.getByTestId('groceries-scope-family');
		expect(scope.querySelector('[data-testid="groceries-stores"]')?.className).toContain('flex-wrap');
		expect(scope.querySelector('p')?.className).toContain('break-words');
	});
});
