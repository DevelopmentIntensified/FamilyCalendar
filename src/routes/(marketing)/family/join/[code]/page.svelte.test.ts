import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import JoinPage from './+page.svelte';
import type { PageData } from './$types';

// oxlint-disable-next-line anti-slop/no-module-mocking -- SvelteKit $app/* is framework-injected; no DI seam exists.
vi.mock('$app/navigation', () => ({ goto: vi.fn(async () => {}) }));

/**
 * Issue 124 — what a person is told when the invite link they followed cannot
 * be used.
 *
 * The page used to redirect to `/family?error=invalid_invite`, where nothing
 * reads that parameter. The rule from AGENTS.md is that a failure says what
 * happened and what to do next, so the unusable-link state is a real state with
 * real copy, not a redirect into silence.
 */

/** The loader's answer, narrowed from SvelteKit's open PageData bag. */
type JoinData = PageData;

function makeData(overrides: Partial<JoinData> = {}): JoinData {
	// SAFETY: fixture mirrors the +page.server.ts load shape; literal values
	// match what the server returns.
	const base = {
		invalid: false,
		family: { id: 'fam-1', name: 'The Hoppers', color: '#c45e38' },
		code: 'abc123',
		isLoggedIn: true
	};
	// SAFETY: every field is the shape the load above returns, narrowed to the
	// PageData the page reads.
	return { ...base, ...overrides } as JoinData;
}

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('join page — a link that cannot be used says so', () => {
	it('names the link as the problem instead of the person', () => {
		render(JoinPage, { props: { data: makeData({ invalid: true, family: null }) } });

		expect(
			screen.getByRole('heading', { name: /isn't valid any more|not valid any more/i })
		).toBeInTheDocument();
	});

	it('offers the three reasons without pretending to know which one it is', () => {
		render(JoinPage, { props: { data: makeData({ invalid: true, family: null }) } });

		// The paragraph is the claim: expired, revoked, or used up — and the
		// server cannot tell them apart, so none of them is asserted alone.
		const reasons = screen.getByText(/may have expired/i, { selector: 'p' });
		expect(reasons).toHaveTextContent(/revoked/i);
		expect(reasons).toHaveTextContent(/already have been taken/i);
	});

	it('says what to do next: ask for a new link', () => {
		render(JoinPage, { props: { data: makeData({ invalid: true, family: null }) } });

		expect(screen.getByText(/ask whoever invited you/i, { selector: 'p' })).toBeInTheDocument();
	});

	it('gives a signed-out visitor somewhere to go, and a way back', () => {
		render(JoinPage, {
			props: { data: makeData({ invalid: true, family: null, isLoggedIn: false }) }
		});

		expect(screen.getByRole('link', { name: /log in/i })).toHaveAttribute('href', '/login');
		expect(screen.getByRole('link', { name: /your families/i })).toHaveAttribute('href', '/family');
	});

	it('never offers the Join button for a link that cannot be used', () => {
		render(JoinPage, { props: { data: makeData({ invalid: true, family: null }) } });

		expect(screen.queryByRole('button', { name: /join family/i })).toBeNull();
	});
});

describe('join page — a link that works still joins', () => {
	it('offers the join step to a signed-in person and confirms it', async () => {
		const fetchMock = vi.fn(async () => ({ json: async () => ({ success: true }) }));
		vi.stubGlobal('fetch', fetchMock);

		render(JoinPage, { props: { data: makeData() } });
		await fireEvent.click(screen.getByRole('button', { name: 'Join Family' }));

		expect(fetchMock).toHaveBeenCalledWith('/api/family/join', expect.anything());
		expect(await screen.findByText(/welcome to the family/i)).toBeInTheDocument();
		vi.unstubAllGlobals();
	});
});