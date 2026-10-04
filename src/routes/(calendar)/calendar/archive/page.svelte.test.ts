import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import ArchivePage from './+page.svelte';
import { ARCHIVE_CARD_PADDING, retentionScale } from '$lib/components/archive/archiveMonths';
import type { PageData } from './$types';

/**
 * 094 rerun, against the approved prototype line by line. The prototype puts
 * the gate at the top, the flat event rows in the middle and three cards down
 * a side column. The app had a single column, nested event cards, no calendar
 * badge, no legend and no side column at all.
 */

function ev(title: string, start: string, location: string | null = null, calendar = 'Family') {
	return { id: `id-${title}`, title, start: new Date(start), location, calendar };
}

interface ArchiveFixture {
	archiveAllowed: boolean;
	events: ReturnType<typeof ev>[];
	retentionDays: number;
	archivedRetentionDays: number;
	planName: string;
	familyCount: number;
	reason?: string;
}

function props(overrides: Partial<ArchiveFixture> = {}) {
	const fixture: ArchiveFixture = {
		archiveAllowed: true,
		events: [
			ev('Christmas party', '2025-12-06T18:00:00.000Z', 'Nana’s', 'Family'),
			ev('Boxing Day', '2025-12-26T18:00:00.000Z', null, 'Hopper Kids'),
			ev('Thanksgiving at Nana’s', '2025-11-28T18:00:00.000Z', 'Nana’s', 'Family')
		],
		retentionDays: 365,
		archivedRetentionDays: 730,
		planName: 'Family',
		familyCount: 1,
		...overrides
	};
	// PageData carries the layout's own fields (user, familyMembers, …) that
	// this page never reads, so a hand-built fixture cannot satisfy the type.
	// SAFETY: `fixture` is this page's own loader output verbatim; only the
	// layout's fields are absent, and the page reads none of them.
	// oxlint-disable-next-line anti-slop/no-chained-type-assertions -- the layout fields make PageData incomparable to a hand-built fixture, so the two-step is the only way to name it.
	return { data: fixture as unknown as PageData };
}

describe('Archive page — the retention gate is shown as a gate', () => {
	afterEach(cleanup);

	// The prototype: "On the Family plan" eyebrow over "You can look back 365
	// days", with a family pill on the right.
	it('names the plan the windows come from', () => {
		render(ArchivePage, props());
		expect(screen.getByTestId('retention-gate').textContent).toContain('On the Family plan');
		expect(screen.getByText(/You can look back 365 days/)).toBeTruthy();
		expect(screen.getByText(/stay in the archive for 730 days/)).toBeTruthy();
		expect(screen.getByTestId('retention-family-pill').textContent!.replace(/\s+/g, ' ')).toContain(
			'1 family'
		);
	});

	// The prototype's three-row legend. Without it the two windows are two
	// sentences; with it they are a picture of what happens to an old event.
	it('draws the three-step scale under the gate', () => {
		render(ArchivePage, props());
		const legend = screen.getByTestId('retention-scale');
		expect(legend.textContent).toContain('Viewable now');
		expect(legend.textContent).toContain('Kept, not viewable');
		expect(legend.textContent).toContain('Deleted');
		expect(legend.textContent).toContain('365 days');
		expect(legend.textContent).toContain('730');
	});

	it('fills the trackbar in the proportion the two windows really are', () => {
		render(ArchivePage, props());
		const fill = screen.getByTestId('retention-track-fill');
		// 365 viewable out of 730 total = half the track.
		expect(fill.style.width).toBe('50%');
	});
});

describe('Archive page — the month cards (094)', () => {
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

	it('gives the month card the same padding as the rows it heads', () => {
		render(ArchivePage, props());
		expect(
			document.querySelector('[data-testid="archive-month"]')!.className
		).toContain(ARCHIVE_CARD_PADDING);
	});

	it('puts the events inside their month card, not beside it', () => {
		render(ArchivePage, props());
		const text = (node: Element) => node.textContent?.replace(/\s+/g, ' ') ?? '';
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

describe('Archive page — the event rows', () => {
	afterEach(cleanup);

	// The prototype row is a LINK with a date on the left, the title, a
	// calendar badge and the place. The app row was an unlinkable card with the
	// date under the title and no badge.
	it('makes every archived event reachable', () => {
		render(ArchivePage, props());
		const rows = [...document.querySelectorAll('[data-testid="archive-event"]')];
		expect(rows).toHaveLength(3);
		for (const row of rows) {
			expect(row.tagName).toBe('A');
			expect(row.getAttribute('href')).toMatch(/^\/calendar\/event\//);
		}
	});

	it('leads each row with its date and carries the place at the end', () => {
		render(ArchivePage, props());
		const row = [...document.querySelectorAll('[data-testid="archive-event"]')].at(-1)!;
		// date, title, place — in the order the approved row draws them.
		const parts = [...row.querySelectorAll('[data-testid="archive-event-part"]')];
		expect(parts.map((p) => p.textContent?.trim())).toEqual([
			'28 Nov 2025',
			'Thanksgiving at Nana’s',
			'Nana’s'
		]);
	});

	it('badges the calendar each event came from', () => {
		render(ArchivePage, props());
		const row = [...document.querySelectorAll('[data-testid="archive-event"]')].at(-1)!;
		expect(row.querySelector('[data-testid="archive-calendar"]')!.textContent).toContain('Family');
	});

	it('omits the place entirely when there is none', () => {
		render(ArchivePage, props());
		const row = [...document.querySelectorAll('[data-testid="archive-event"]')].find((r) =>
			r.textContent?.includes('Boxing Day')
		)!;
		// date and title only — no empty span standing in for a missing place.
		expect(row.querySelectorAll('[data-testid="archive-event-part"]')).toHaveLength(2);
		expect(row.textContent).not.toContain('undefined');
	});
});

describe('Archive page — the side column', () => {
	afterEach(cleanup);

	// Three cards the prototype puts beside the list. The app had no second
	// column, so all three were absent.
	it('carries the three cards the prototype puts beside the list', () => {
		render(ArchivePage, props());
		const side = screen.getByTestId('archive-side');
		expect(side.textContent).toContain('What is this for?');
		expect(side.textContent).toContain('Recurring events stop here');
		expect(side.textContent).toContain('Nothing links here');
	});

	it('offers the way back to the calendar the third card names', () => {
		render(ArchivePage, props());
		const link = screen.getByTestId('archive-side').querySelector('a[href="/calendar"]');
		expect(link).toBeTruthy();
	});

	it('keeps the side column beside the list, not under it', () => {
		render(ArchivePage, props());
		const layout = screen.getByTestId('archive-layout');
		expect(layout.className).toContain('lg:grid-cols-[minmax(0,1fr)_19rem]');
		expect(layout.children).toHaveLength(2);
	});
});

describe('Archive page — the gate states real numbers (125 note)', () => {
	afterEach(cleanup);

	it('does not invent a 30-day window when the gate is closed', () => {
		render(
			ArchivePage,
			props({
				archiveAllowed: false,
				events: [],
				reason: 'Archive view is not included on your plan.'
			})
		);
		expect(screen.getByText(/look back 365 days/i)).toBeTruthy();
		expect(screen.queryByText(/events from 30 days ago/i)).toBeNull();
		expect(screen.getByText(/not included on your plan/i)).toBeTruthy();
	});

	it('keeps the scale readable when the plan keeps nothing', () => {
		// archivedRetentionDays 0 means the second band is empty, not negative.
		render(ArchivePage, props({ archivedRetentionDays: 0 }));
		expect(retentionScale({ viewDays: 365, archivedDays: 0 }).kept).toBe(0);
	});
});