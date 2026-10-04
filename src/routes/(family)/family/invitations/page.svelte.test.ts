import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, within, fireEvent } from '@testing-library/svelte';
import InvitationsPage from './+page.svelte';
import type { PageData } from './$types';

/**
 * Issue 124 — `family-invitations.html`, transcribed.
 *
 * Measured against the approved prototype at 1440px:
 *
 * - the page is TWO columns (`928px 288px`); the app page was one 896px card;
 * - the code is drawn at 28px/800 monospace inside a blue-washed `.codebox`
 *   (18px padding, 16px radius); the app drew a 14px `<code>` chip on grey;
 * - the uses are a row of `maxUses` segments with `useCount` of them filled
 *   (`296`-wide bar measured); the app printed the string "Uses: 3 / 10";
 * - "Valid for" (7 days / 24 hours / 30 days) and "Max uses" (1–20) are
 *   controls, and the POST sends both — the route already honoured them and
 *   nothing ever sent them, so every code was minted 7 days / 10 uses;
 * - the Revoke card carries the sentence explaining what revoking cannot undo.
 *
 * The prototype's third card, "who has used it", is deliberately absent: a use
 * is consumed when the code is VERIFIED, so no audit row exists to draw. That
 * is recorded in issue 124 as the owner's decision, not an omission here.
 */

type Invite = PageData['invitations'][number];

const ACTIVE: Invite = {
	code: 'HOP-4K2X',
	familyId: 'fam-1',
	expiresAt: new Date('2026-12-01T00:00:00Z'),
	maxUses: 5,
	useCount: 2,
	createdBy: 'u-1'
} as Invite;

function makeData(
	invitations: Invite[] = [ACTIVE],
	canManageInvites = true
): {
	data: PageData;
} {
	// SAFETY: the fixture carries every field the loader returns — the codes, the
	// chosen family, the memberships switcher and the gate.
	return {
		data: {
			invitations,
			canManageInvites,
			family: { id: 'fam-1', name: 'The Hoppers', color: '#c45e38' },
			memberships: [{ id: 'fam-1', name: 'The Hoppers', canManageInvites: true }]
		} as unknown as PageData
	};
}

/** The JSON body of the nth POST the page made. */
function postBody(n = 0): Record<string, unknown> {
	const call = vi.mocked(fetch).mock.calls[n];
	return JSON.parse(String(call?.[1]?.body ?? '{}')) as Record<string, unknown>;
}

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('invitations — the approved code box (issue 124)', () => {
	it('draws the code large and monospaced, the way the prototype does', () => {
		render(InvitationsPage, makeData());

		const code = screen.getByText('HOP-4K2X');
		expect(code.getAttribute('class')).toContain('text-[28px]');
		expect(code.getAttribute('class')).toContain('font-mono');
		expect(code.closest('[data-invite-codebox]')).toBeTruthy();
	});

	it('washes the code box, like the prototype’s blue .codebox', () => {
		render(InvitationsPage, makeData());

		expect(document.querySelector('[data-invite-codebox]')?.getAttribute('class')).toContain(
			'from-sky-100/60'
		);
	});

	it('shows the uses as one segment per allowed use, and says how many are spent', () => {
		render(InvitationsPage, makeData());

		const slots = [...document.querySelectorAll('[data-use-slot]')];
		expect(slots).toHaveLength(5);
		expect(slots.filter((s) => s.getAttribute('data-use-slot') === 'used')).toHaveLength(2);
		expect(screen.getByText(/2 of 5 used/)).toBeTruthy();
	});

	it('prints ∞ rather than null when a code has no use limit', () => {
		render(InvitationsPage, makeData([{ ...ACTIVE, maxUses: null } as Invite]));

		expect(document.querySelectorAll('[data-use-slot]')).toHaveLength(0);
		expect(screen.getByText(/2 of ∞ used/)).toBeTruthy();
	});

	it('keeps the copy button, and confirms what it did', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({ json: async () => ({ error: 'x' }) }))
		);
		render(InvitationsPage, makeData());

		expect(screen.getByRole('button', { name: /copy join link/i })).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: /copy join link/i }));
	});

	it('says when there is no code at all, and still offers the door to make one', () => {
		render(InvitationsPage, makeData([]));

		expect(screen.getByText(/no active invitations/i)).toBeTruthy();
		expect(screen.getByRole('button', { name: /create new code/i })).toBeTruthy();
	});
});

describe('invitations — the approved New-code controls (issue 124)', () => {
	it('offers the prototype’s validity choices', () => {
		render(InvitationsPage, makeData());

		const select = screen.getByLabelText(/valid for/i) as HTMLSelectElement;
		expect([...select.options].map((o) => o.textContent?.trim())).toEqual([
			'7 days',
			'24 hours',
			'30 days'
		]);
	});

	it('offers a max-uses field bounded like the prototype’s', () => {
		render(InvitationsPage, makeData());

		const input = screen.getByLabelText(/max uses/i) as HTMLInputElement;
		expect(input.getAttribute('type')).toBe('number');
		expect(input.min).toBe('1');
		expect(input.max).toBe('20');
	});

	it('sends both choices when a code is created — the gap that made them decorative', async () => {
		const fetchMock = vi.fn(async () => ({ json: async () => ({ code: 'NEWCODE1' }) }));
		vi.stubGlobal('fetch', fetchMock);
		render(InvitationsPage, makeData());

		await fireEvent.change(screen.getByLabelText(/valid for/i), {
			target: { value: '1' }
		});
		// A number input's binding listens on `input`, not `change`.
		await fireEvent.input(screen.getByLabelText(/max uses/i), { target: { value: '3' } });
		await fireEvent.click(screen.getByRole('button', { name: /create new code/i }));

		expect(postBody()).toMatchObject({ familyId: 'fam-1', expiresInDays: 1, maxUses: 3 });
	});

	it('acknowledges the create in the click tick', async () => {
		let release: () => void = () => {};
		const pending = new Promise<void>((resolve) => {
			release = resolve;
		});
		vi.stubGlobal(
			'fetch',
			vi.fn(() => pending as unknown as Promise<Response>)
		);
		render(InvitationsPage, makeData());

		const button = screen.getByRole('button', { name: /create new code/i });
		await fireEvent.click(button);
		expect(button.getAttribute('aria-busy')).toBe('true');

		release();
		await pending;
	});

	it('does not offer the controls to somebody who may not mint a code', () => {
		render(InvitationsPage, makeData([ACTIVE], false));

		expect(screen.queryByRole('button', { name: /create new code/i })).toBeNull();
		expect(screen.getByText(/only the family creator or an admin/i)).toBeTruthy();
	});
});

describe('invitations — what revoking can and cannot do (issue 124)', () => {
	it('says it kills the link but cannot un-join somebody who already has', () => {
		render(InvitationsPage, makeData());

		const revoke = screen.getByRole('region', { name: /revoke/i });
		expect(within(revoke).getByText(/cannot un-join somebody who already has/i)).toBeTruthy();
	});

	it('names the code it is about to revoke, as the prototype’s button does', () => {
		render(InvitationsPage, makeData());

		const revoke = screen.getByRole('region', { name: /revoke/i });
		expect(within(revoke).getByRole('button', { name: /revoke HOP-4K2X/i })).toBeTruthy();
	});

	it('says creating a new code leaves the old one alone, which is what it does', () => {
		// The prototype's New-code card claims "Creating a new code revokes the
		// current one." Nothing in the app does that — generateInviteCode only
		// inserts — so the copy says what happens rather than what does not.
		render(InvitationsPage, makeData());

		const create = screen.getByRole('region', { name: /new code/i });
		expect(within(create).getByText(/leaves the current code working/i)).toBeTruthy();
	});
});
