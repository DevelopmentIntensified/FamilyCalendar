import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/svelte';
import FamilyListPage from './+page.svelte';
import type { ActionData, PageData } from './$types';

// oxlint-disable-next-line anti-slop/no-module-mocking -- SvelteKit $app/* is framework-injected; no DI seam exists.
vi.mock('$app/forms', () => ({
	enhance: vi.fn(() => vi.fn())
}));

/**
 * Issue 124 — the approved family card (`prototypes/app-ui/family.html`).
 *
 * The prototype is one family's card: the family's initial on its colour, the
 * stat strip (Members / Created / Colour), a strip of the PEOPLE in it, and
 * three ways in. The app keeps its own list — every family the user belongs to,
 * its empty state and its invite gates — and gives each family that card.
 *
 * What these tests pin is the part that was missing: **first names**. The
 * prototype draws an avatar per member; an avatar with no name under it answers
 * "how many", not "who", and the loader only used to return a count.
 */

type ListPageProps = { data: PageData; form: ActionData };

/** One family row exactly as the loader returns it (issues 098 + 124 + 078). */
interface FamilyRow {
	id: string;
	name: string;
	color: string | null;
	createdAt: Date;
	createdLabel: string;
	memberCount: number;
	openTasks: number;
	members: { firstName: string | null }[];
	canInvite: boolean;
}

const BASE_FAMILY: FamilyRow = {
	id: 'fam-1',
	name: 'Rivera Home',
	color: '#c45e38',
	createdAt: new Date('2026-03-12T00:00:00Z'),
	createdLabel: '3/12/2026',
	memberCount: 4,
	openTasks: 3,
	members: [{ firstName: 'Maya' }, { firstName: 'Sam' }, { firstName: 'Eli' }, { firstName: 'Ruth' }],
	canInvite: true
};

function makeData(families: FamilyRow[] = [BASE_FAMILY]): ListPageProps {
	// SAFETY: the fixture carries every field the loader returns for this page —
	// the family row (counts, roster first names, invite gate) and the plan
	// figures behind the pill — so the cast adds no fiction.
	return { data: { families, plan: { used: families.length, limit: 5 } } as PageData, form: null };
}

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('families list — the approved card (issue 124)', () => {
	it("names the people in the family, not just how many there are", () => {
		render(FamilyListPage, makeData());

		const card = screen.getByRole('link', { name: /Rivera Home/ });
		expect(within(card).getByText('Maya, Sam, Eli, Ruth')).toBeTruthy();
	});

	it('keeps a long roster readable — the strip caps and says how many more', () => {
		render(
			FamilyListPage,
			makeData([
				{
					...BASE_FAMILY,
					members: [
						{ firstName: 'Maya' },
						{ firstName: 'Sam' },
						{ firstName: 'Eli' },
						{ firstName: 'Ruth' },
						{ firstName: 'Ada' },
						{ firstName: 'Bo' },
						{ firstName: 'Cy' }
					]
				}
			])
		);

		expect(screen.getByText(/2 more/)).toBeTruthy();
	});

	it('says so when nobody has a first name yet, rather than printing an empty strip', () => {
		render(FamilyListPage, makeData([{ ...BASE_FAMILY, members: [] }]));

		expect(screen.getByText(/no names yet/i)).toBeTruthy();
	});

	it('carries the stat strip the prototype draws: members, created, colour', () => {
		render(FamilyListPage, makeData());

		const card = screen.getByRole('link', { name: /Rivera Home/ });
		expect(within(card).getByText('Members')).toBeTruthy();
		expect(within(card).getByText('Created')).toBeTruthy();
		expect(within(card).getByText('Colour')).toBeTruthy();
		expect(within(card).getByText('3/12/2026')).toBeTruthy();
	});

	it('offers the prototype’s three ways in, each naming where it goes', () => {
		render(FamilyListPage, makeData());

		expect(screen.getByRole('link', { name: 'Open family' }).getAttribute('href')).toBe(
			'/family/fam-1'
		);
		expect(screen.getByRole('link', { name: 'Members' }).getAttribute('href')).toBe(
			'/family/fam-1#members-heading'
		);
		expect(screen.getByRole('link', { name: 'Family tasks' }).getAttribute('href')).toBe(
			'/family/tasks'
		);
	});
});