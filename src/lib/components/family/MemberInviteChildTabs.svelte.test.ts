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
		// #190: the parental-consent checkbox is required, client and server.
		await fireEvent.click(screen.getByLabelText(/I am this child’s parent or guardian/));
		await fireEvent.click(screen.getByRole('button', { name: 'Create Child' }));
		await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
		expect(vi.mocked(fetch)).toHaveBeenCalledWith(
			'/family/fam1/members/add/child',
			expect.objectContaining({
				method: 'POST',
				body: expect.stringContaining('"consentAcknowledged":true')
			})
		);
	});

	it('does not submit without the parental-consent acknowledgment', async () => {
		render(MemberChildTab, { props });
		await fireEvent.input(screen.getByLabelText("Child's First Name"), {
			target: { value: 'Kid' }
		});
		await fireEvent.input(screen.getByLabelText("Child's Last Name"), {
			target: { value: 'Kidson' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Create Child' }));
		expect(vi.mocked(fetch)).not.toHaveBeenCalled();
	});
});

describe('add-a-member — the approved warnings (issue 124)', () => {
	// `family-members-add.html` puts two notes on the page that the app page did
	// not carry at all. Measured: `noteWarn: 0`, `noteWarnText: "MISSING"` — the
	// child pane had only the one grey line under the email field.
	// Issue 102 — the approved prototype's warning said a child "can never sign
	// in", which is false: the endpoint creates the account through the standard
	// user-creation path, so the child CAN sign in — by magic link only, since
	// no password is set. The copy states the true version up front.
	it('warns about the unique email BEFORE the child save button, not after it', () => {
		render(MemberChildTab, { props });

		const warn = screen.getByRole('note', { name: /a child is a real account/i });
		expect(warn).toBeInTheDocument();
		expect(within(warn).getByText(/no password is set/i)).toBeInTheDocument();
		expect(within(warn).getByText(/magic link/i)).toBeInTheDocument();
		expect(within(warn).getByText(/only holder/i)).toBeInTheDocument();
		expect(within(warn).getByText(/unique across all of Family Planz/i)).toBeInTheDocument();
		// The unique-address rule is stated as a rule, not as an error the user
		// discovers by submitting.
		expect(within(warn).queryByText(/rejected on save/i)).toBeNull();

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

// Issue 091 — the last bespoke copy handler. The other invite copy affordances
// go through the shared `copyOrShare` ladder (share sheet, clipboard,
// selection); this tab still talked straight to `navigator.clipboard`.
describe('MemberInviteTab — the copy button uses the shared share/copy ladder', () => {
	const REAL_NAVIGATOR = window.navigator;
	let clipboard: { writeText: ReturnType<typeof vi.fn> } | undefined;
	let share: ReturnType<typeof vi.fn> | undefined;

	beforeEach(() => {
		clipboard = undefined;
		share = undefined;
	});

	function install(opts: { clipboard?: boolean; share?: boolean; deny?: boolean }): void {
		if (opts.share) {
			share = vi.fn(async () => undefined);
		}
		if (opts.clipboard) {
			clipboard = {
				writeText: vi.fn(async () => {
					if (opts.deny) throw new Error('denied');
				})
			};
		}
		Object.defineProperty(window, 'navigator', {
			value: { ...(clipboard ? { clipboard } : {}), ...(share ? { share } : {}) },
			configurable: true
		});
	}

	afterEach(() => {
		Object.defineProperty(window, 'navigator', { value: REAL_NAVIGATOR, configurable: true });
		vi.unstubAllGlobals();
		cleanup();
	});

	async function showLinkAndCopy(): Promise<void> {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({ ok: true, json: async () => ({ link: 'https://x/invite/link-1' }) }))
		);
		render(MemberInviteTab, { props });
		await fillInvite();
		await fireEvent.click(screen.getByRole('button', { name: 'Get Invite Link' }));
		await screen.findByDisplayValue('https://x/invite/link-1');
		await fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
	}

	it('uses the platform share sheet when there is one', async () => {
		install({ share: true, clipboard: true });
		await showLinkAndCopy();

		expect(share).toHaveBeenCalledTimes(1);
		expect(clipboard!.writeText).not.toHaveBeenCalled();
		expect(await screen.findByRole('button', { name: /Shared ✓/ })).toBeInTheDocument();
	});

	it('falls back to copy where the platform share is absent', async () => {
		install({ clipboard: true });
		await showLinkAndCopy();

		expect(share).toBeUndefined();
		expect(clipboard!.writeText).toHaveBeenCalledWith('https://x/invite/link-1');
		expect(await screen.findByRole('button', { name: /Copied ✓/ })).toBeInTheDocument();
	});

	it('keeps the honest failure copy when nothing on the ladder works', async () => {
		await showLinkAndCopy();

		expect(
			await screen.findByText(/select the link above and copy it manually/i)
		).toBeInTheDocument();
	});
});
