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

type ManagePageProps = { data: PageData; form: null };

function makeData(overrides: Partial<PageData> = {}): ManagePageProps {
	const base = {
		family: { id: 'fam1', name: 'Testers', color: '#3b82f6' },
		members: baseMembers,
		currentUserRole: 'creator',
		currentUserId: 'u1',
		activity: [],
		moduleSwitches: {},
		...overrides
	};
	// SAFETY: fixture mirrors the full +page.server.ts load shape (family, members,
	// currentUserRole, currentUserId, activity, moduleSwitches); literal values match
	// the member/activity row shapes the server returns.
	return { data: base as PageData, form: null };
}

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
			'/family/fam1/tasks'
		);
		const invitations = screen
			.getByRole('heading', { name: 'Invitations', level: 2 })
			.closest('section');
		// SAFETY: closest('section') matches the rendered <section> card element.
		expect(
			within(invitations as HTMLElement).getByRole('link', { name: /Manage invitations/ })
		).toHaveAttribute('href', '/family/fam1/invitations');
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
