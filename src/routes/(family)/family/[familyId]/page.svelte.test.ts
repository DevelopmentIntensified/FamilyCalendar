import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/svelte';
import FamilyManagePage from './+page.svelte';
import type { PageData } from './$types';

// oxlint-disable-next-line anti-slop/no-module-mocking -- SvelteKit $app/* is framework-injected; no DI seam exists.
vi.mock('$app/forms', () => ({
	enhance: vi.fn(() => vi.fn())
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- SvelteKit $app/* is framework-injected; no DI seam exists.
vi.mock('$app/navigation', () => ({
	invalidateAll: vi.fn()
}));

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

const baseMembers = [
	{
		userId: 'u1',
		firstName: 'Ada',
		lastName: 'Owner',
		email: 'ada@example.com',
		role: 'creator',
		memberType: 'parent'
	},
	{
		userId: 'u2',
		firstName: 'Bob',
		lastName: 'Member',
		email: 'bob@example.com',
		role: 'member',
		memberType: 'child'
	}
];

/** The plan band with no tier behind it — what a user on the default plan sees. */
const PLAN_USAGE_NO_TIER = {
	tierName: null,
	aiUsed: 0,
	aiLimit: 10,
	familiesUsed: 1,
	familyLimit: 1,
	members: 2,
	memberLimit: 6,
	archivedRetentionDays: 90,
	exportImportEnabled: false
} satisfies NonNullable<PageData['planUsage']>;

type ManagePageProps = { data: PageData; form: null };

function makeData(overrides: Partial<PageData> = {}): ManagePageProps {
	const base = {
		family: { id: 'fam1', name: 'Testers', color: '#3b82f6' },
		members: baseMembers,
		currentUserRole: 'creator',
		currentUserId: 'u1',
		activity: [],
		moduleSwitches: {},
		activeInvite: null,
		inviteCreatedBy: null,
		planUsage: {
			tierName: 'Family Master',
			aiUsed: 4,
			aiLimit: 10,
			familiesUsed: 2,
			familyLimit: 5,
			members: 2,
			memberLimit: 6,
			archivedRetentionDays: 90,
			exportImportEnabled: true
		},
		...overrides
	};
	// SAFETY: fixture mirrors the full +page.server.ts load shape (family, members,
	// currentUserRole, currentUserId, activity, moduleSwitches, activeInvite,
	// inviteCreatedBy, planUsage); literal values match the shapes the server returns.
	return { data: base as PageData, form: null };
}

describe('family page — the approved side bands (issue 124)', () => {
	it('shows the live invitation with its code, uses, expiry and who minted it', () => {
		render(
			FamilyManagePage,
			makeData({
				activeInvite: {
					code: 'LIVE123',
					useCount: 2,
					maxUses: 10,
					expiresAt: new Date('2026-10-10T00:00:00Z')
				},
				inviteCreatedBy: 'Maya'
			})
		);
		const band = screen.getByRole('region', { name: /active invitation/i });
		expect(within(band).getByText('LIVE123')).toBeTruthy();
		expect(within(band).getByText(/2 of 10/)).toBeTruthy();
		expect(within(band).getByText(/Maya/)).toBeTruthy();
	});

	it('says there is no live invitation rather than leaving the band blank', () => {
		render(FamilyManagePage, makeData({ activeInvite: null }));
		const band = screen.getByRole('region', { name: /active invitation/i });
		expect(within(band).getByText(/no active invitation/i)).toBeTruthy();
	});

	it('shows the plan usage band with the tier name and every figure', () => {
		render(FamilyManagePage, makeData());
		const band = screen.getByRole('region', { name: /plan usage/i });
		expect(within(band).getByText('Family Master')).toBeTruthy();
		expect(within(band).getByText('4/10')).toBeTruthy();
		expect(within(band).getByText('2 of 5')).toBeTruthy();
		expect(within(band).getByText('2 of 6')).toBeTruthy();
		expect(within(band).getByText(/90 days/)).toBeTruthy();
	});

	it('says "no plan" rather than naming a tier the user does not have', () => {
		render(FamilyManagePage, makeData({ planUsage: PLAN_USAGE_NO_TIER }));
		const band = screen.getByRole('region', { name: /plan usage/i });
		expect(within(band).getByText(/no plan/i)).toBeTruthy();
		expect(within(band).getByText(/not on this plan/i)).toBeTruthy();
	});

	it('explains the child constraint, because a child is a real user row', () => {
		render(FamilyManagePage, makeData());
		const band = screen.getByRole('region', { name: /children are users/i });
		expect(within(band).getByText(/unique email/i)).toBeTruthy();
		expect(within(band).getByRole('link', { name: /see the form/i })).toBeTruthy();
	});

	it('offers the shared-data links the prototype groups together', () => {
		render(FamilyManagePage, makeData());
		const band = screen.getByRole('region', { name: /shared data/i });
		for (const name of [/family tasks/i, /grocery/i, /family calendar/i, /invitations/i]) {
			expect(within(band).getByRole('link', { name })).toBeTruthy();
		}
	});
});

describe('family manage page — card stack', () => {
	it('renders the hero with family name, member count and viewer role pill', () => {
		render(FamilyManagePage, makeData());
		expect(screen.getByRole('heading', { name: 'Testers', level: 1 })).toBeInTheDocument();
		expect(screen.getByText(/2 members/)).toBeInTheDocument();
		expect(screen.getAllByText('creator').length).toBeGreaterThan(0);
	});

	it('shows the settings card inline for admins (no toggle button)', () => {
		render(FamilyManagePage, makeData());
		expect(screen.getByRole('heading', { name: 'Family Settings', level: 2 })).toBeInTheDocument();
		expect(screen.getByLabelText('Family Name')).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument();
	});

	it('shows the admin gear and add-member hero CTA for admins', () => {
		render(FamilyManagePage, makeData());
		expect(screen.getByRole('button', { name: 'Jump to family settings' })).toBeInTheDocument();
		expect(screen.getAllByRole('link', { name: 'Add member' }).length).toBeGreaterThan(0);
	});

	it('hides settings card, gear, add-member CTA and member actions from plain members', () => {
		render(FamilyManagePage, makeData({ currentUserRole: 'member', currentUserId: 'u2' }));
		expect(
			screen.queryByRole('heading', { name: 'Family Settings', level: 2 })
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole('button', { name: 'Jump to family settings' })
		).not.toBeInTheDocument();
		expect(screen.queryByRole('link', { name: 'Add member' })).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: /Actions for/ })).not.toBeInTheDocument();
	});

	it('gates Edit and Remove to other members only (never on self)', () => {
		render(FamilyManagePage, makeData());
		expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
		// Admins get a kebab for every member (member-type access), including self.
		expect(screen.getByRole('button', { name: 'Actions for Ada Owner' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Actions for Bob Member' })).toBeInTheDocument();
	});

	it('shows the member-type pill for non-admin viewers', () => {
		render(FamilyManagePage, makeData({ currentUserRole: 'member', currentUserId: 'u2' }));
		expect(screen.getAllByText('parent').length).toBeGreaterThan(0);
	});

	it('renders the members card header with Family Tasks link and invitations card rows', () => {
		render(FamilyManagePage, makeData());
		expect(screen.getByRole('heading', { name: 'Members', level: 2 })).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Family Tasks' })).toHaveAttribute(
			'href',
			// One board, one route: the per-family path held a near-copy page
			// that threw on load (issue 124).
			'/family/tasks'
		);
		const invitations = screen
			.getByRole('heading', { name: 'Invitations', level: 2 })
			.closest('section');
		// SAFETY: closest('section') matches the rendered <section> card element.
		// Invitations is one route, not per-family — see links.test.ts (#064).
		expect(
			within(invitations as HTMLElement).getByRole('link', { name: /Manage invitations/ })
		).toHaveAttribute('href', '/family/invitations');
	});

	it('surfaces form.error as an alert banner', () => {
		// SAFETY: the page only reads `form.error`; a partial ActionData literal is fine.
		render(FamilyManagePage, { data: makeData().data, form: { error: 'Nope.' } as never });
		expect(screen.getByRole('alert')).toHaveTextContent('Nope.');
	});

	it('renders recent activity in its own card', () => {
		const overrides = {
			activity: [
				{
					kind: 'completed',
					actorName: 'Ada',
					title: 'Wash dishes',
					targetName: null,
					at: new Date().toISOString()
				}
			]
		};
		// SAFETY: activity item shape mirrors server rows (kind/actorName/title/targetName/at).
		render(FamilyManagePage, makeData(overrides as Partial<PageData>));
		expect(screen.getByRole('heading', { name: 'Recent Activity', level: 2 })).toBeInTheDocument();
		expect(screen.getByText(/completed 'Wash dishes'/)).toBeInTheDocument();
	});
});
