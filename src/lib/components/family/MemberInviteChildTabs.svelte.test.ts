import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MemberInviteTab from './MemberInviteTab.svelte';
import MemberChildTab from './MemberChildTab.svelte';

const props = { familyId: 'fam1', onSuccess: () => {}, onError: () => {} };

beforeEach(() => {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => ({ ok: true, json: async () => ({}) }))
	);
});

afterEach(() => {
	vi.unstubAllGlobals();
	cleanup();
});

async function fillInvite() {
	await fireEvent.input(screen.getByLabelText('First Name'), { target: { value: 'Al' } });
	await fireEvent.input(screen.getByLabelText('Last Name'), { target: { value: 'Admin' } });
	await fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'al@x.com' } });
}

describe('MemberInviteTab', () => {
	it('posts the invite and reports success', async () => {
		const onSuccess = vi.fn();
		render(MemberInviteTab, { props: { ...props, onSuccess } });
		await fillInvite();
		await fireEvent.click(screen.getByRole('button', { name: 'Send Invite' }));
		await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
		expect(vi.mocked(fetch)).toHaveBeenCalledWith(
			'/family/fam1/members/add/email',
			expect.objectContaining({ method: 'POST' })
		);
	});

	it('generates + shows the share link', async () => {
		vi.mocked(fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => ({ link: 'https://x/invite/abc' })
		} as Response);
		render(MemberInviteTab, { props });
		await fillInvite();
		await fireEvent.click(screen.getByRole('button', { name: 'Get Invite Link' }));
		expect(await screen.findByText('Expires in 24 hours')).toBeInTheDocument();
		expect(screen.getByDisplayValue('https://x/invite/abc')).toBeInTheDocument();
	});
});

describe('MemberChildTab', () => {
	it('posts the child record and reports success', async () => {
		const onSuccess = vi.fn();
		render(MemberChildTab, { props: { ...props, onSuccess } });
		await fireEvent.input(screen.getByLabelText("Child's First Name"), {
			target: { value: 'Kid' }
		});
		await fireEvent.input(screen.getByLabelText("Child's Last Name"), {
			target: { value: 'Kidson' }
		});
		await fireEvent.input(screen.getByLabelText('Email'), {
			target: { value: 'kid@x.com' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Create Child' }));
		await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
		expect(vi.mocked(fetch)).toHaveBeenCalledWith(
			'/family/fam1/members/add/child',
			expect.objectContaining({ method: 'POST' })
		);
	});
});

describe('add-a-member — the approved warnings (issue 124)', () => {
	// `family-members-add.html` puts two notes on the page that the app page did
	// not carry at all. Measured: `noteWarn: 0`, `noteWarnText: "MISSING"` — the
	// child pane had only the one grey line under the email field.
	it('warns about the unique email BEFORE the child save button, not after it', () => {
		render(MemberChildTab, { props });

		const warn = screen.getByRole('note', { name: /a child is a real account/i });
		expect(warn).toBeInTheDocument();
		expect(within(warn).getByText(/unique index/i)).toBeInTheDocument();
		expect(within(warn).getByText(/rejected on save/i)).toBeInTheDocument();

		// …and the warning comes before the button that trips it.
		const order = [...document.querySelectorAll('body *')];
		const warnAt = order.findIndex((el) => el.getAttribute('role') === 'note');
		const buttonAt = order.findIndex((el) => (el.textContent ?? '') === 'Create Child');
		expect(warnAt).toBeGreaterThanOrEqual(0);
		expect(warnAt).toBeLessThan(buttonAt);
	});

	it('washes that warning blush, the way the prototype’s .note-warn does', () => {
		render(MemberChildTab, { props });

		const warn = screen.getByRole('note', { name: /a child is a real account/i });
		expect(warn.getAttribute('class')).toContain('from-orange-100');
	});

	it('says what an emailed invite actually gets them', () => {
		// The prototype's `.note-ok` under the email form. It was missing.
		render(MemberInviteTab, { props });

		const note = screen.getByRole('note', { name: /what they get/i });
		expect(within(note).getByText(/\/family\/join/)).toBeInTheDocument();
	});
});
