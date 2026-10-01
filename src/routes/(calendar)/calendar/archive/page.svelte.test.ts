import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import ArchivePage from './+page.svelte';
import { ARCHIVE_CARD_PADDING } from '$lib/components/archive/archiveMonths';
import type { PageData } from './$types';

function ev(title: string, start: string, location: string | null = null) {
	return { id: title, title, start: new Date(start), location };
}

interface ArchiveFixture {
	archiveAllowed: boolean;
	events: ReturnType<typeof ev>[];
	retentionDays: number;
	archivedRetentionDays: number;
	reason?: string;
}

/** SAFETY: a page fixture, built once here rather than threaded through every
 *  case. Every field is the shape `+page.server.ts` returns. */
function props(overrides: Partial<ArchiveFixture> = {}) {
	const fixture: ArchiveFixture = {
		archiveAllowed: true,
		events: [
			ev('Christmas party', '2025-12-06T18:00:00.000Z', 'Nana’s'),
			ev('Boxing Day', '2025-12-26T18:00:00.000Z'),
			ev('Thanksgiving at Nana’s', '2025-11-28T18:00:00.000Z')
		],
		retentionDays: 365,
		archivedRetentionDays: 730,
		...overrides
	};
	// PageData carries the layout's own fields (user, familyMembers, …) that
	// this page never reads, so a hand-built fixture cannot satisfy the type.
	// SAFETY: `fixture` is this page's own loader output verbatim; only the
	// layout's fields are absent, and the page reads none of them.
	// oxlint-disable-next-line anti-slop/no-chained-type-assertions -- the layout fields make PageData incomparable to a hand-built fixture, so the two-step is the only way to name it.
	return { data: fixture as unknown as PageData };
}

describe('Archive page — the month card (094)', () => {
	afterEach(cleanup);

	it('heads each month with its own card, named and counted', () => {
		render(ArchivePage, props());
		const months = [...document.querySelectorAll('[data-testid="archive-month"]')];
		const text = (node: Element) => node.textContent?.replace(/\s+/g, ' ').trim() ?? '';
		expect(months).toHaveLength(2);
		expect(text(months[0])).toContain('December 2025');
		expect(text(months[0])).toContain('2 events');
		expect(text(months[1])).toContain('November 2025');
		expect(text(months[1])).toContain('1 event');
	});

	it('gives the month card the same padding as the cards it heads', () => {
		render(ArchivePage, props());
		const monthCard = document.querySelector('[data-testid="archive-month"]')!;
		const eventCard = document.querySelector('[data-testid="archive-event"]')!;
		expect(monthCard.className).toContain(ARCHIVE_CARD_PADDING);
		expect(eventCard.className).toContain(ARCHIVE_CARD_PADDING);
	});

	it('puts the events inside their month card, not beside it', () => {
		render(ArchivePage, props());
		const text = (node: Element) => node.textContent?.replace(/\s+/g, ' ').trim() ?? '';
		const months = [...document.querySelectorAll('[data-testid="archive-month"]')];
		expect(months[0].querySelectorAll('[data-testid="archive-event"]')).toHaveLength(2);
		expect(text(months[0])).toContain('Christmas party');
		expect(text(months[0])).toContain('Boxing Day');
		expect(text(months[1])).toContain('Thanksgiving at Nana’s');
	});

	it('renders no month card for an empty archive', () => {
		render(ArchivePage, props({ events: [] }));
		expect(document.querySelectorAll('[data-testid="archive-month"]')).toHaveLength(0);
		expect(screen.getByText(/no archived events/i)).toBeTruthy();
	});
});

describe('Archive page — the gate states real numbers (125 note)', () => {
	afterEach(cleanup);

	it('shows both retention windows, read from the plan', () => {
		render(ArchivePage, props());
		expect(screen.getByText(/look back 365 days/i)).toBeTruthy();
		expect(screen.getByText(/stay in the archive for 730 days/i)).toBeTruthy();
	});

	it('does not invent a 30-day window when the gate is closed', () => {
		// The loader used to hardcode `retentionDays: 30` on the gated branch,
		// which the page printed as "Events from 30 days ago" - a number no
		// plan had ever produced.
		render(ArchivePage, {
			props: props({
				archiveAllowed: false,
				events: [],
				reason: 'Archive view is not included on your plan.'
			})
		});
		expect(screen.getByText(/look back 365 days/i)).toBeTruthy();
		expect(screen.queryByText(/events from 30 days ago/i)).toBeNull();
		expect(screen.getByText(/not included on your plan/i)).toBeTruthy();
	});
});
