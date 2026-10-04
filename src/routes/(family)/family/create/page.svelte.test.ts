import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { enhance } from '$app/forms';
import { toasts } from '$lib/client/toasts';
import CreateFamilyPage from './+page.svelte';
import type { PageData } from './$types';

// oxlint-disable-next-line anti-slop/no-module-mocking -- SvelteKit $app/* is framework-injected; no DI seam exists.
vi.mock('$app/forms', () => ({ enhance: vi.fn(() => vi.fn()) }));

type CreatePageProps = { data: PageData; form: null };

function makeData(overrides: Partial<PageData> = {}): CreatePageProps {
	// SAFETY: fixture mirrors the +page.server.ts load shape (user, familyLimit,
	// familyLimitReached, familyUsed); literal values match what the server returns.
	const base = {
		user: { id: 'u1', email: 'ada@example.com' },
		familyLimit: 1,
		familyLimitReached: false,
		familyUsed: 0,
		memberLimit: 5,
		...overrides
	};
	return { data: base as PageData, form: null };
}

/** The submit callback the page handed to `use:enhance` at mount. */
type SubmitFn = (arg: {
	update: () => Promise<{ type: string }>;
	result: { type: string };
}) => Promise<void>;

/**
 * The submit callback the page handed to `use:enhance` at mount. Svelte calls an
 * action as (node, param, …), so pick the function argument rather than a
 * position — the node comes first.
 */
function lastSubmitFn(): SubmitFn {
	const call = vi.mocked(enhance).mock.calls.at(-1);
	const fn = call?.find((arg) => typeof arg === 'function');
	if (!fn) throw new Error('the form never handed enhance() a submit callback');
	return fn as unknown as SubmitFn;
}

/**
 * Drive one submit the way SvelteKit does: the submit handler runs on the event
 * and hands back the action, which the framework then calls with the result.
 */
async function submitWithResult(type: string) {
	const action = lastSubmitFn()({} as never) as unknown as (arg: {
		update: () => Promise<{ type: string }>;
		result: { type: string };
	}) => Promise<void>;
	await action({ update: async () => ({ type }), result: { type } });
}

beforeEach(() => {
	// The toast store is module-level and outlives a single render.
	toasts.set([]);
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	toasts.set([]);
});

describe('create family page — the approved composition', () => {
	it('previews the family under its placeholder name until one is typed', () => {
		render(CreateFamilyPage, makeData());

		expect(screen.getByText('Your family')).toBeInTheDocument();
	});

	it('previews the family live as it is named', async () => {
		render(CreateFamilyPage, makeData());

		await fireEvent.input(screen.getByLabelText('What do you call it?'), {
			target: { value: 'The Hoppers' }
		});

		expect(screen.getByText('The Hoppers')).toBeInTheDocument();
		expect(screen.queryByText('Your family')).not.toBeInTheDocument();
	});

	it('asks who is in it, and says how many the plan allows', () => {
		// "Members before the finish line" (issue 076): a family created with
		// nobody in it is a shell. The picker lives INSIDE the create form, so
		// a pick rides along with the submit rather than needing a second trip.
		render(CreateFamilyPage, makeData({ memberLimit: 6 }));

		expect(screen.getByText('Who is in it')).toBeInTheDocument();
		expect(screen.getByLabelText('Search by name or email')).toBeInTheDocument();
		expect(screen.getByText('1 of 6 members')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /create family/i }).closest('form')).toContainElement(
			screen.getByLabelText('Search by name or email')
		);
	});

	it('asks for the name and for the colour in plain words, not a character count', () => {
		render(CreateFamilyPage, makeData());

		expect(screen.getByLabelText('What do you call it?')).toBeInTheDocument();
		expect(screen.getByText(/tints the family calendar/)).toBeInTheDocument();
		expect(screen.queryByText(/max 50 characters/)).not.toBeInTheDocument();
	});

	it('offers the curated earthy set, six swatches, and defaults to its first entry', () => {
		render(CreateFamilyPage, makeData());

		const swatches = screen.getByRole('group', { name: 'Family colour' });
		expect(swatches.querySelectorAll('button')).toHaveLength(6);
		expect(screen.getByRole('button', { name: 'Terracotta' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		// The colour the form would post is the one the preview is showing.
		expect(screen.getByLabelText('Family colour value')).toHaveValue('#c45e38');
	});

	it('repaints the preview when another swatch is chosen', async () => {
		render(CreateFamilyPage, makeData());

		await fireEvent.click(screen.getByRole('button', { name: 'Sage' }));

		expect(screen.getByLabelText('Family colour value')).toHaveValue('#4d9c85');
		expect(screen.getByRole('button', { name: 'Sage' })).toHaveAttribute('aria-pressed', 'true');
		// The chosen colour is named out loud, not just painted.
		expect(screen.getByText('Sage selected')).toBeInTheDocument();
	});

	it('shows the usage line against the plan limit', () => {
		render(CreateFamilyPage, makeData({ familyUsed: 1, familyLimit: 1 }));

		expect(screen.getByText('1 of 1 family used on your plan.')).toBeInTheDocument();
	});

	it('pluralises the usage line when the plan allows more than one family', () => {
		render(CreateFamilyPage, makeData({ familyUsed: 2, familyLimit: 5 }));

		expect(screen.getByText('2 of 5 families used on your plan.')).toBeInTheDocument();
	});

	it('keeps the heading, the field, the button and the cancel link the specs assert on', () => {
		render(CreateFamilyPage, makeData());

		expect(screen.getByRole('heading', { name: 'Create a Family' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Create Family' })).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute('href', '/family');
	});

	it('confirms the create with a toast naming the family', async () => {
		render(CreateFamilyPage, makeData());
		await fireEvent.input(screen.getByLabelText('What do you call it?'), {
			target: { value: 'The Hoppers' }
		});

		await submitWithResult('redirect');

		expect(get(toasts).map((t) => t.message)).toEqual(['The Hoppers created — opening it now']);
	});

	it('stays silent on a failed create, where the error box already names it', async () => {
		render(CreateFamilyPage, makeData());

		await submitWithResult('failure');

		expect(get(toasts)).toEqual([]);
	});
});

describe('create family page — the approved preview and closing note (issue 124)', () => {
	// `family-create.html` measures the preview as padding 22px / radius 24px with
	// a 112px blurred glow, and shows an avatar per PICKED member under the name,
	// plus a dashed "+" slot while fewer than two are picked (`:63-66`). Measured
	// on the app page: `previewAvatars: 0`, `previewDashPlus: 0`.
	function preview() {
		return document.querySelector('[data-family-preview]') as HTMLElement;
	}

	it('gives the preview the prototype’s box', () => {
		render(CreateFamilyPage, makeData());

		expect(preview().getAttribute('class')).toContain('rounded-3xl');
		expect(preview().querySelector('[data-preview-glow]')).toBeTruthy();
	});

	it('offers a slot for the first member even before anybody is picked', () => {
		// The dashed "+" is how the preview says "there is room here".
		render(CreateFamilyPage, makeData({ memberLimit: 6 }));

		expect(preview().querySelector('[data-preview-open-slot]')).toBeTruthy();
	});

	it('draws one avatar per person who is in it', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({
				json: async () => ({
					users: [{ id: 'u2', firstName: 'Nana', lastName: 'Ray', email: 'n@x.com' }]
				})
			}))
		);
		render(CreateFamilyPage, makeData({ memberLimit: 6 }));

		await fireEvent.input(screen.getByLabelText('Search by name or email'), {
			target: { value: 'nana' }
		});
		await vi.waitFor(() =>
			expect(screen.getByRole('button', { name: /add nana ray/i })).toBeTruthy()
		);
		await fireEvent.click(screen.getByRole('button', { name: /add nana ray/i }));

		expect(preview().querySelectorAll('[data-preview-avatar]')).toHaveLength(1);
		vi.unstubAllGlobals();
	});

	it('closes with "What happens next", the way the approved page does', () => {
		// `family-create.html:113-121`. The app page ended at the usage line.
		render(CreateFamilyPage, makeData());

		const next = screen.getByRole('region', { name: /what happens next/i });
		expect(within(next).getByText(/a family calendar/i)).toBeInTheDocument();
		expect(within(next).getByText(/nobody in it is a shell/i)).toBeInTheDocument();
	});
});
