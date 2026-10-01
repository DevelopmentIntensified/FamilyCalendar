import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { tick } from 'svelte';
import { toasts } from '$lib/client/toasts';
import { enhance } from '$app/forms';
import FamilyListPage from './+page.svelte';
import type { ActionData, PageData } from './$types';

// oxlint-disable-next-line anti-slop/no-module-mocking -- SvelteKit $app/* is framework-injected; no DI seam exists.
vi.mock('$app/forms', () => ({ enhance: vi.fn(() => vi.fn()) }));

/**
 * Issue 091 — "Invite by link", on the family page.
 *
 * The gap 091 names is discoverability, not machinery: the code worked and
 * nothing led to it. So the thing to pin is that the affordance is THERE, that
 * it is only there for somebody allowed to use it, and that clicking it
 * acknowledges in the click tick and then confirms what happened and what to do
 * with it (the UI rules in AGENTS.md — no silent reload, no bare alert).
 */

/** What the action returns: a path. What the page shows: the same, absolute. */
const REL = '/family/join/abc123';
const JOIN_URL = `${window.location.origin}${REL}`;

type ListPageProps = { data: PageData; form: ActionData };

/** One family row exactly as the loader returns it (issue 098 + 124). */
interface FamilyRow {
	id: string;
	name: string;
	color: string | null;
	createdAt: Date;
	memberCount: number;
	openTasks: number;
	canInvite: boolean;
}

function family(overrides: Partial<FamilyRow> = {}): FamilyRow {
	return {
		id: 'fam-1',
		name: 'Rivera Home',
		color: '#c45e38',
		createdAt: new Date('2026-01-04'),
		memberCount: 4,
		openTasks: 3,
		canInvite: true,
		...overrides
	};
}

/** The mint action's answer, as the page reads it back off `form`. */
type MintForm = ActionData | null;

function makeData(families: FamilyRow[], form: MintForm = null): ListPageProps {
	// SAFETY: fixture mirrors the +page.server.ts load shape (families, plan)
	// plus the layout's three fields; literal values match what the server returns.
	const base = {
		user: { id: 'u1', email: 'ada@example.com' },
		isLoggedIn: true,
		pathname: '/family',
		families,
		plan: { used: families.length, limit: 5 }
	};
	return { data: base as PageData, form };
}

/**
 * The submit factory the page handed to `use:enhance` last. Svelte calls the
 * action as (node, param, …), so pick the function argument rather than a
 * position — the node comes first.
 */
type SubmitFactory = () => ResultFn;
type ResultFn = (arg: {
	update: () => Promise<{ type: string }>;
	result: { type: string };
}) => Promise<void>;

function lastSubmitFn(): SubmitFactory {
	const call = vi.mocked(enhance).mock.calls.at(-1);
	const fn = call?.find((arg) => typeof arg === 'function');
	if (!fn) throw new Error('the form never handed enhance() a submit callback');
	// SAFETY: the page hands `use:enhance` a factory of exactly this shape, and
	// enhance is mocked — so the recorded argument is that factory.
	return fn as unknown as SubmitFactory;
}

/**
 * Drive one submit the way SvelteKit does: the factory runs synchronously on
 * submit (that is where the ack must already have happened), and the function
 * it returns is called with the server's answer.
 */
async function submitWithResult(type: 'success' | 'failure') {
	const action = lastSubmitFn()();
	await action({ update: async () => ({ type }), result: { type } });
}

beforeEach(() => {
	toasts.set([]);
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	toasts.set([]);
});

describe('families list — invite by link is on the page (issue 091)', () => {
	it('offers a link for a family you create or administer', () => {
		render(FamilyListPage, makeData([family()]));

		expect(screen.getByRole('button', { name: /invite by link/i })).toBeInTheDocument();
	});

	it('offers one per family, so a two-family user is not left guessing', () => {
		render(FamilyListPage, makeData([family(), family({ id: 'fam-2', name: 'Lake House' })]));

		expect(screen.getAllByRole('button', { name: /invite by link/i })).toHaveLength(2);
	});

	it('does not offer it to a plain member — minting is creator/admin only', () => {
		render(FamilyListPage, makeData([family({ canInvite: false })]));

		expect(screen.queryByRole('button', { name: /invite by link/i })).toBeNull();
	});

	it('still points every member at the invitations they already have', () => {
		render(FamilyListPage, makeData([family({ canInvite: false })]));

		expect(screen.getByRole('link', { name: /view family invitations/i })).toBeInTheDocument();
	});

	it('acknowledges in the click tick, before the request answers', async () => {
		render(FamilyListPage, makeData([family()]));

		const button = screen.getByRole('button', { name: /invite by link/i });
		await fireEvent.click(button);
		// The submit factory is what the framework calls on submit; running it is
		// the click tick. No await between it and the assertion, so the ack has
		// to already be there.
		lastSubmitFn()();
		await tick();

		expect(button).toHaveAttribute('aria-busy', 'true');
		expect(button.textContent).toMatch(/…/);
	});

	it('confirms what happened and what to do with it once the link is back', async () => {
		render(FamilyListPage, makeData([family()]));
		await fireEvent.click(screen.getByRole('button', { name: /invite by link/i }));
		await submitWithResult('success');

		expect(get(toasts).at(-1)?.message).toMatch(/Rivera Home/);
		expect(get(toasts).at(-1)?.message).toMatch(/send|link/i);
	});

	it('says so when the request failed instead of pretending it worked', async () => {
		render(FamilyListPage, makeData([family()]));
		await fireEvent.click(screen.getByRole('button', { name: /invite by link/i }));
		await submitWithResult('failure');

		expect(get(toasts).at(-1)?.message).toMatch(/couldn't|try again/i);
	});
});

describe('families list — the minted link is readable without a clipboard', () => {
	it('shows the join link for the family it was minted for', () => {
		render(
			FamilyListPage,
			makeData([family()], {
				familyId: 'fam-1',
				inviteCode: 'abc123',
				inviteUrl: REL
			})
		);

		expect(screen.getByDisplayValue(JOIN_URL)).toBeInTheDocument();
	});

	it('does not show one link above another family it was not minted for', () => {
		render(
			FamilyListPage,
			makeData(
				[family(), family({ id: 'fam-2', name: 'Lake House' })],
				{ familyId: 'fam-1', inviteCode: 'abc123', inviteUrl: REL }
			)
		);

		const links = screen.getAllByDisplayValue(JOIN_URL);
		expect(links).toHaveLength(1);
	});
});