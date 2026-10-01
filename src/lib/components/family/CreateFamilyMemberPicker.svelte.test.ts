import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import CreateFamilyMemberPicker from './CreateFamilyMemberPicker.svelte';

/**
 * Issue 124 / 076 — the create page's member picker.
 *
 * The prototype's premise is "members before the finish line": a family made
 * with nobody in it is a shell, because the calendar belongs to the family and
 * with no members there is nobody to see it.
 *
 * The picker searches `/api/family/member-search` — its own door, built for
 * exactly this case (issue 100: the invite-flow search refuses any caller who
 * is not already a member of the family in the query string, and there is no
 * family yet). It posts one `memberIds` field per person into the create form;
 * the create action is what decides whether they can be added.
 */

const HITS = [
	{ id: 'u-anna', firstName: 'Anna', lastName: 'Ray', email: 'anna@hoppers.test' },
	{ id: 'u-nana', firstName: 'Nana', lastName: 'Ray', email: 'nana@hoppers.test' }
];

beforeEach(() => {
	vi.useFakeTimers();
	vi.stubGlobal(
		'fetch',
		// "zz" stands for a query with no match; everything else returns HITS.
		vi.fn(async (url: string) => ({
			ok: true,
			json: async () => ({ users: String(url).includes('q=zz') ? [] : HITS })
		}))
	);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
	cleanup();
});

/** The props the create page passes. */
const props = { limit: 5 };

/** Type into the picker and let the debounce fire. */
async function type(value: string) {
	await fireEvent.input(screen.getByPlaceholderText(/search by name or email/i), {
		target: { value }
	});
	await vi.advanceTimersByTimeAsync(350);
}

describe('CreateFamilyMemberPicker', () => {
	it('does not ask the server for a single letter — the search has a floor', async () => {
		render(CreateFamilyMemberPicker, { props });
		await type('a');

		expect(fetch).not.toHaveBeenCalled();
	});

	it('lists the people the search returns', async () => {
		render(CreateFamilyMemberPicker, { props });
		await type('an');

		expect(await screen.findByText('anna@hoppers.test')).toBeInTheDocument();
		expect(vi.mocked(fetch).mock.calls[0][0]).toContain('q=an');
	});

	it('tells the user when nobody matches, and points at the other way in', async () => {
		render(CreateFamilyMemberPicker, { props });
		await type('zz');

		expect(await screen.findByText(/no account by that name/i)).toBeInTheDocument();
	});

	it('posts a picked person as a memberIds field inside the create form', async () => {
		render(CreateFamilyMemberPicker, { props });
		await type('an');
		await fireEvent.click(await screen.findByText('anna@hoppers.test'));

		const hidden = document.querySelectorAll('input[name="memberIds"]');
		expect(hidden).toHaveLength(1);
		expect(hidden[0]).toHaveValue('u-anna');
	});

	it('shows the count against the plan limit, so the ceiling is not a surprise', async () => {
		render(CreateFamilyMemberPicker, { props });
		expect(screen.getByText('1 of 5 members')).toBeInTheDocument();

		await type('an');
		await fireEvent.click(await screen.findByText('anna@hoppers.test'));

		expect(screen.getByText('2 of 5 members')).toBeInTheDocument();
	});

	it('stops offering people once the plan limit is reached', async () => {
		// Two members on the plan: the creator plus one more.
		render(CreateFamilyMemberPicker, { props: { limit: 2 } });
		await type('an');
		await fireEvent.click(await screen.findByText('anna@hoppers.test'));

		expect(screen.queryByPlaceholderText(/search by name or email/i)).toBeNull();
		expect(screen.getByText(/member limit/i)).toBeInTheDocument();
	});

	it('leaves out anybody already picked, so a second pick cannot duplicate them', async () => {
		render(CreateFamilyMemberPicker, { props });
		await type('an');
		await fireEvent.click(await screen.findByText('anna@hoppers.test'));
		await type('an');

		await waitFor(() => expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(1));
		const lastUrl = String(vi.mocked(fetch).mock.calls.at(-1)?.[0]);
		expect(lastUrl).toContain('exclude=u-anna');
		expect(screen.getAllByRole('button', { name: /add nana/i })).toHaveLength(1);
	});

	it('takes a person back off the list', async () => {
		render(CreateFamilyMemberPicker, { props });
		await type('an');
		await fireEvent.click(await screen.findByText('anna@hoppers.test'));
		await fireEvent.click(screen.getByRole('button', { name: /remove anna/i }));

		expect(document.querySelectorAll('input[name="memberIds"]')).toHaveLength(0);
		expect(screen.getByText('1 of 5 members')).toBeInTheDocument();
	});
});