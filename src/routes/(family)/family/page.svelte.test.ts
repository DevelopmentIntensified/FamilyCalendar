import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, within, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
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
	members: { firstName: string | null; userId: string }[];
	canInvite: boolean;
}

/** One roster row for the approved page's side rail (issue 124). */
interface RosterRow {
	familyId: string;
	userId: string;
	firstName: string | null;
	lastName: string | null;
	role: string | null;
	memberType: string | null;
}

/** One live join code for the rail's invitations card (issue 124). */
interface ActiveInvite {
	familyId: string;
	code: string;
	useCount: number;
	maxUses: number | null;
	expiresAt: Date;
}

const BASE_FAMILY: FamilyRow = {
	id: 'fam-1',
	name: 'Rivera Home',
	color: '#c45e38',
	createdAt: new Date('2026-03-12T00:00:00Z'),
	createdLabel: '3/12/2026',
	memberCount: 4,
	openTasks: 3,
	members: [
		{ firstName: 'Maya', userId: 'u-maya' },
		{ firstName: 'Sam', userId: 'u-sam' },
		{ firstName: 'Eli', userId: 'u-eli' },
		{ firstName: 'Ruth', userId: 'u-ruth' }
	],
	canInvite: true
};

const BASE_ROSTER: RosterRow[] = [
	{
		familyId: 'fam-1',
		userId: 'u-maya',
		firstName: 'Maya',
		lastName: 'Lopez',
		role: 'creator',
		memberType: 'parent'
	},
	{
		familyId: 'fam-1',
		userId: 'u-sam',
		firstName: 'Sam',
		lastName: 'Rivera',
		role: 'admin',
		memberType: 'parent'
	},
	{
		familyId: 'fam-1',
		userId: 'u-eli',
		firstName: 'Eli',
		lastName: 'Rivera',
		role: 'member',
		memberType: 'child'
	}
];

const BASE_INVITE: ActiveInvite = {
	familyId: 'fam-1',
	code: 'HOP-4K2X',
	useCount: 2,
	maxUses: 5,
	expiresAt: new Date('2026-12-01T00:00:00Z')
};

function makeData(
	families: FamilyRow[] = [BASE_FAMILY],
	roster: RosterRow[] = BASE_ROSTER,
	activeInvites: ActiveInvite[] = [BASE_INVITE]
): ListPageProps {
	// SAFETY: the fixture carries every field the loader returns for this page —
	// the family row, the rail's roster, the rail's live code and the plan
	// figures behind the pill — so the cast adds no fiction.
	return {
		data: {
			families,
			roster,
			activeInvites,
			plan: { used: families.length, limit: 5 }
		} as unknown as PageData,
		form: null
	};
}

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('families list — the approved card (issue 124)', () => {
	it('names the people in the family, not just how many there are', () => {
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
						{ firstName: 'Maya', userId: 'u1' },
						{ firstName: 'Sam', userId: 'u2' },
						{ firstName: 'Eli', userId: 'u3' },
						{ firstName: 'Ruth', userId: 'u4' },
						{ firstName: 'Ada', userId: 'u5' },
						{ firstName: 'Bo', userId: 'u6' },
						{ firstName: 'Cy', userId: 'u7' }
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

	it('carries the prototype’s card box: 1.75rem of padding, a 1.5rem radius and its glow', () => {
		// Measured: `family.html`'s `.famcard` is padding 28px, radius 24px, with
		// one `.famcard__glow` inside it. The app card measured padding 16px,
		// radius 16px and no glow at all.
		render(FamilyListPage, makeData());

		const card = screen.getByRole('link', { name: /Rivera Home/ });
		const box = card.closest('li');
		expect(box?.className).toContain('p-7');
		expect(box?.className).toContain('rounded-3xl');
		expect(box?.querySelector('[data-family-glow]')).toBeTruthy();
	});

	it('gives each avatar that person’s own colour, the way ${m.tone} does', () => {
		// Every avatar on the app card measured one flat grey, because a first
		// name cannot pick a tone. The loader now carries the userId.
		render(FamilyListPage, makeData());

		const card = screen.getByRole('link', { name: /Rivera Home/ });
		const avatars = [...card.querySelectorAll('[data-roster-avatar]')];
		expect(avatars.length).toBe(4);
		const tones = new Set(avatars.map((a) => a.getAttribute('data-roster-avatar')));
		expect(tones.size).toBeGreaterThan(1);
	});

	it('offers a way to ADD a member, which the app page had no link to at all', () => {
		// Measured: `family.html` carries a `link-add` row into the add-member
		// page; the app page had zero hrefs matching `/members/add`.
		render(FamilyListPage, makeData());

		expect(screen.getByRole('link', { name: 'Add a member' }).getAttribute('href')).toBe(
			'/family/fam-1/members/add'
		);
	});

	it('does not offer "Add a member" to somebody who may not add one', () => {
		render(FamilyListPage, makeData([{ ...BASE_FAMILY, canInvite: false }]));

		expect(screen.queryByRole('link', { name: 'Add a member' })).toBeNull();
	});
});

describe('families list — the approved two-column composition (issue 124)', () => {
	// Measured at 1440px: `family.html`'s `.grid2` resolves to `908px 304px`.
	// The app page was a single `max-w-4xl` (896px) stack.

	it('puts the family list in a main column and the rail beside it', () => {
		render(FamilyListPage, makeData());

		const main = screen.getByRole('main');
		const rail = screen.getByRole('complementary', { name: /family details/i });
		const grid = main.parentElement;
		expect(grid?.getAttribute('class')).toContain('lg:grid-cols-[minmax(0,1fr)_19rem]');
		expect(rail.parentElement).toBe(grid);
	});

	it('lists the roster in the rail — name, Member Type and role, per person', () => {
		render(FamilyListPage, makeData());

		const rail = screen.getByRole('complementary', { name: /family details/i });
		const rows = within(rail).getAllByTestId('rail-member');
		expect(rows.length).toBe(3);
		expect(within(rows[0]).getByText('Maya Lopez')).toBeTruthy();
		// Member Type is the personal profile; role is the permission. Both, and
		// never one standing in for the other.
		expect(within(rows[0]).getByText('parent')).toBeTruthy();
		expect(within(rows[0]).getByText('creator')).toBeTruthy();
		expect(within(rows[2]).getByText('child')).toBeTruthy();
		expect(within(rows[2]).getByText('member')).toBeTruthy();
	});

	it('links the rail’s roster to the family it belongs to', () => {
		render(FamilyListPage, makeData());

		const rail = screen.getByRole('complementary', { name: /family details/i });
		expect(within(rail).getByRole('link', { name: 'Manage →' }).getAttribute('href')).toBe(
			'/family/fam-1'
		);
	});

	it('says so plainly when a family has no people to list', () => {
		render(FamilyListPage, makeData([BASE_FAMILY], []));

		const rail = screen.getByRole('complementary', { name: /family details/i });
		expect(within(rail).getByText(/no names yet/i)).toBeTruthy();
	});
});

describe('families list — the approved invitations card (issue 124)', () => {
	// Measured: `family.html`'s rail shows the code itself (`HOP-4K2X`, 14px/800
	// mono), a `n/max used` pill, the expiry, a copy button and a Manage button.
	// The app page showed none of it — `inviteCodeShown` measured "NONE".

	it('shows the live code, its uses, its expiry and a way to manage it', () => {
		render(FamilyListPage, makeData());

		const rail = screen.getByRole('complementary', { name: /family details/i });
		expect(within(rail).getByText('HOP-4K2X')).toBeTruthy();
		expect(within(rail).getByText('2 of 5 used')).toBeTruthy();
		expect(within(rail).getByText(/expires/i)).toBeTruthy();
		expect(
			within(rail).getByRole('link', { name: 'Manage invitations' }).getAttribute('href')
		).toBe(
			// `?familyId=` addresses the family this rail is showing; the page
			// resolves the oldest membership without it (issue 098).
			'/family/invitations?familyId=fam-1'
		);
	});

	it('acknowledges the copy in the click tick and then names what happened', async () => {
		// A clipboard that never answers keeps the request in flight, which is
		// the only honest way to see the ack: the button has to go busy before
		// anything resolves, not after.
		let release: (() => void) | undefined;
		const pending = new Promise<void>((resolve) => (release = resolve));
		vi.stubGlobal('navigator', {
			...window.navigator,
			clipboard: { writeText: () => pending }
		});

		render(FamilyListPage, makeData());

		const rail = screen.getByRole('complementary', { name: /family details/i });
		const copy = within(rail).getByRole('button', { name: /copy join link/i });
		await fireEvent.click(copy);
		await tick();
		expect(copy.getAttribute('aria-busy')).toBe('true');

		release?.();
		await pending;
		await tick();
		expect(copy.getAttribute('aria-busy')).toBe('false');
		expect(within(rail).getByText(/Copied/)).toBeTruthy();
		vi.unstubAllGlobals();
	});

	it('prints ∞ for a code with no use limit rather than null', () => {
		render(
			FamilyListPage,
			makeData([BASE_FAMILY], BASE_ROSTER, [{ ...BASE_INVITE, maxUses: null }])
		);

		const rail = screen.getByRole('complementary', { name: /family details/i });
		expect(within(rail).getByText('2 of ∞ used')).toBeTruthy();
	});

	it('says there is no live link, and still offers the door to mint one', () => {
		render(FamilyListPage, makeData([BASE_FAMILY], BASE_ROSTER, []));

		const rail = screen.getByRole('complementary', { name: /family details/i });
		expect(within(rail).getByText(/no live join link/i)).toBeTruthy();
		expect(within(rail).getByRole('link', { name: 'Manage invitations' })).toBeTruthy();
	});
});
