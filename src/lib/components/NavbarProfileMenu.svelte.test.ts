import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, afterEach } from 'vitest';
import NavbarProfileMenu from './NavbarProfileMenu.svelte';

const admin = { firstName: 'Al', lastName: 'Admin', email: 'al@x.com', roles: ['admin'] };
const member = { firstName: 'Bo', lastName: null, email: 'bo@x.com', roles: ['member'] };

afterEach(cleanup);

describe('NavbarProfileMenu', () => {
	it('shows the user header + settings links', () => {
		render(NavbarProfileMenu, {
			props: { user: member, onNavigate: vi.fn(), onLogoutSubmit: vi.fn() }
		});
		expect(screen.getByText('bo@x.com')).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Logout' })).toBeInTheDocument();
	});

	it('gates admin links on the admin role', () => {
		const { unmount } = render(NavbarProfileMenu, {
			props: { user: admin, onNavigate: vi.fn(), onLogoutSubmit: vi.fn() }
		});
		expect(screen.getByRole('link', { name: 'Admin' })).toBeInTheDocument();
		unmount();
		render(NavbarProfileMenu, {
			props: { user: member, onNavigate: vi.fn(), onLogoutSubmit: vi.fn() }
		});
		expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
	});

	it('notifies the parent on link click so the dropdown can close', async () => {
		const onNavigate = vi.fn();
		render(NavbarProfileMenu, {
			props: { user: member, onNavigate, onLogoutSubmit: vi.fn() }
		});
		await fireEvent.click(screen.getByRole('link', { name: 'Settings' }));
		expect(onNavigate).toHaveBeenCalledOnce();
	});
});
