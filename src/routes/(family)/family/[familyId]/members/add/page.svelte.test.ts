import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within, fireEvent } from '@testing-library/svelte';
import AddMemberPage from './+page.svelte';
import type { PageData } from './$types';

/**
 * Issue 124 — `family-members-add.html`, transcribed.
 *
 * Measured against the approved prototype:
 *
 * - the tab strip is INLINE and hugs its buttons — 120/121/118px, radius 12px.
 *   The app page stretched three equal 173px buttons across the whole card at
 *   radius 8px, so the control read as three columns rather than three tabs;
 * - the labels are the prototype's words: "Find someone", "Invite by email",
 *   "Create a child". The app said "Search Users", "Invite by Email",
 *   "Create Child";
 * - each tab is a `role="tab"` in a `role="tablist"`, so the strip is one
 *   control rather than three loose buttons. The app had neither.
 *
 * The child pane's up-front warning and the email pane's "What they get" note
 * are pinned in `MemberInviteChildTabs.svelte.test.ts`, next to the components
 * that render them.
 */

function makeData(canInviteByEmail = true): { data: PageData } {
	// SAFETY: the fixture carries every field the loader returns — the family
	// name and id, and the email-invite gate.
	return {
		data: { familyId: 'fam-1', familyName: 'The Hoppers', canInviteByEmail } as unknown as PageData
	};
}

afterEach(cleanup);

describe('add a member — the approved three tabs (issue 124)', () => {
	it('names the tabs the way the prototype names them', () => {
		render(AddMemberPage, makeData());

		expect(screen.getAllByRole('tab').map((t) => t.textContent?.trim())).toEqual([
			'Find someone',
			'Invite by email',
			'Create a child'
		]);
	});

	it('is one tablist, not three loose buttons', () => {
		render(AddMemberPage, makeData());

		const list = screen.getByRole('tablist');
		expect(within(list).getAllByRole('tab')).toHaveLength(3);
		expect(
			within(list).getByRole('tab', { name: 'Find someone' }).getAttribute('aria-selected')
		).toBe('true');
	});

	it('lets the tab strip hug its buttons instead of stretching across the card', () => {
		// The prototype's `.tabs` is `display:inline-flex`; measured tab widths
		// were 120/121/118px. `flex` + `flex-1` made every tab 173px — the
		// control read as a three-column layout.
		render(AddMemberPage, makeData());

		const list = screen.getByRole('tablist');
		expect(list.getAttribute('class')).toContain('inline-flex');
		expect(list.getAttribute('class')).not.toContain('flex-1');
		expect(list.getAttribute('class')).toContain('rounded-xl');
	});

	it('switches panes when a tab is chosen', async () => {
		render(AddMemberPage, makeData());

		await fireEvent.click(screen.getByRole('tab', { name: 'Create a child' }));
		expect(screen.getByLabelText("Child's First Name")).toBeInTheDocument();
		expect(screen.queryByLabelText('Search by name or email')).toBeNull();
	});

	it('still hides the email tab from somebody who may not use it', () => {
		// Real capability the prototype cannot have: minting an emailed code is
		// creator/admin-only.
		render(AddMemberPage, makeData(false));

		expect(screen.getAllByRole('tab').map((t) => t.textContent?.trim())).toEqual([
			'Find someone',
			'Create a child'
		]);
	});
});
