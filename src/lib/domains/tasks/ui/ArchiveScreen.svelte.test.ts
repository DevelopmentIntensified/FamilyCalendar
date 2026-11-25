import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import ArchiveScreen from './ArchiveScreen.svelte';
import { ARCHIVE_CARD_PADDING } from '../tasks.archive.rules';
import type { TaskArchiveEvent, TaskArchivePage } from '../tasks.contract';

/**
 * 094 rerun against the approved prototype, line by line (legacy
 * `(calendar)/calendar/archive/page.svelte.test.ts`, carried over whole): the
 * gate at the top, the flat event rows in the middle and three cards down a
 * side column.
 */

function archiveEvent(
	title: string,
	start: string,
	location: string | null = null,
	calendar: string | null = 'Family'
): TaskArchiveEvent {
	return {
		id: `id-${title}`,
		calendarId: null,
		ownerId: 'user-1',
		title,
		start: new Date(start),
		end: new Date(0),
		description: null,
		location,
		allDay: false,
		recurrenceFrequency: null,
		recurrenceInterval: null,
		recurrenceByDay: null,
		recurrenceCount: null,
		recurrenceUntil: null,
		reminderMinutes: null,
		mirrorOf: null,
		created_at: '2025-11-01T00:00:00.000Z',
		calendar
	};
}

function archiveData(overrides: Partial<TaskArchivePage> = {}): TaskArchivePage {
	return {
		archiveAllowed: true,
		events: [
			archiveEvent('Christmas party', '2025-12-06T18:00:00.000Z', 'Nana’s', 'Family'),
			archiveEvent('Boxing Day', '2025-12-26T18:00:00.000Z', null, 'Hopper Kids'),
			archiveEvent('Thanksgiving at Nana’s', '2025-11-28T18:00:00.000Z', 'Nana’s', 'Family')
		],
		retentionDays: 365,
		archivedRetentionDays: 730,
		planName: 'Family',
		familyCount: 1,
		...overrides
	};
}

describe('Archive page — the retention gate is shown as a gate', () => {
	afterEach(cleanup);

	it('names the plan the windows come from', () => {
		render(ArchiveScreen, { data: archiveData() });
		expect(screen.getByTestId('retention-gate').textContent).toContain('On the Family plan');
		expect(screen.getByText(/You can look back 365 days/)).toBeTruthy();
		expect(screen.getByText(/stay in the archive for 730 days/)).toBeTruthy();
		expect(
			screen.getByTestId('retention-family-pill').textContent?.replace(/\s+/g, ' ')
		).toContain('1 family');
	});

	it('draws the three-step scale under the gate', () => {
		render(ArchiveScreen, { data: archiveData() });
		const legend = screen.getByTestId('retention-scale');
		expect(legend.textContent).toContain('Viewable now');
		expect(legend.textContent).toContain('Kept, not viewable');
		expect(legend.textContent).toContain('Deleted');
		expect(legend.textContent).toContain('365 days');
		expect(legend.textContent).toContain('730');
	});

	it('fills the trackbar in the proportion the two windows really are', () => {
		render(ArchiveScreen, { data: archiveData() });
		const fill = screen.getByTestId('retention-track-fill');
		// 365 viewable out of 730 total = half the track.
		expect(fill.style.width).toBe('50%');
	});
});

describe('Archive page — the month cards (094)', () => {
	afterEach(cleanup);

	it('heads each month with its own card, named and counted', () => {
		render(ArchiveScreen, { data: archiveData() });
		const months = [...document.querySelectorAll('[data-testid="archive-month"]')];
		const text = (node: Element) => node.textContent?.replace(/\s+/g, ' ').trim() ?? '';
		expect(months).toHaveLength(2);
		expect(text(months[0] as Element)).toContain('December 2025');
		expect(text(months[0] as Element)).toContain('2 events');
		expect(text(months[1] as Element)).toContain('November 2025');
		expect(text(months[1] as Element)).toContain('1 event');
	});

	it('gives the month card the same padding as the rows it heads', () => {
		render(ArchiveScreen, { data: archiveData() });
		expect(document.querySelector('[data-testid="archive-month"]')?.className).toContain(
			ARCHIVE_CARD_PADDING
		);
	});

	it('puts the events inside their month card, not beside it', () => {
		render(ArchiveScreen, { data: archiveData() });
		const text = (node: Element) => node.textContent?.replace(/\s+/g, ' ') ?? '';
		const months = [...document.querySelectorAll('[data-testid="archive-month"]')];
		expect(months[0]?.querySelectorAll('[data-testid="archive-event"]')).toHaveLength(2);
		expect(text(months[0] as Element)).toContain('Christmas party');
		expect(text(months[0] as Element)).toContain('Boxing Day');
		expect(text(months[1] as Element)).toContain('Thanksgiving at Nana’s');
	});

	it('renders no month card for an empty archive', () => {
		render(ArchiveScreen, { data: archiveData({ events: [] }) });
		expect(document.querySelectorAll('[data-testid="archive-month"]')).toHaveLength(0);
		expect(screen.getByText(/no archived events/i)).toBeTruthy();
	});
});

describe('Archive page — the event rows', () => {
	afterEach(cleanup);

	it('makes every archived event reachable', () => {
		render(ArchiveScreen, { data: archiveData() });
		const rows = [...document.querySelectorAll('[data-testid="archive-event"]')];
		expect(rows).toHaveLength(3);
		for (const row of rows) {
			expect(row.tagName).toBe('A');
			expect(row.getAttribute('href')).toMatch(/^\/calendar\/event\//);
		}
	});

	it('leads each row with its date and carries the place at the end', () => {
		render(ArchiveScreen, { data: archiveData() });
		const row = [...document.querySelectorAll('[data-testid="archive-event"]')].at(-1);
		const parts = [...(row?.querySelectorAll('[data-testid="archive-event-part"]') ?? [])];
		expect(parts.map((part) => part.textContent?.trim())).toEqual([
			'28 Nov 2025',
			'Thanksgiving at Nana’s',
			'Nana’s'
		]);
	});

	it('badges the calendar each event came from', () => {
		render(ArchiveScreen, { data: archiveData() });
		const row = [...document.querySelectorAll('[data-testid="archive-event"]')].at(-1);
		expect(row?.querySelector('[data-testid="archive-calendar"]')?.textContent).toContain('Family');
	});

	it('omits the place entirely when there is none', () => {
		render(ArchiveScreen, { data: archiveData() });
		const row = [...document.querySelectorAll('[data-testid="archive-event"]')].find((entry) =>
			entry.textContent?.includes('Boxing Day')
		);
		// date and title only — no empty span standing in for a missing place.
		expect(row?.querySelectorAll('[data-testid="archive-event-part"]')).toHaveLength(2);
		expect(row?.textContent).not.toContain('undefined');
	});
});

describe('Archive page — the side column', () => {
	afterEach(cleanup);

	it('carries the three cards the prototype puts beside the list', () => {
		render(ArchiveScreen, { data: archiveData() });
		const side = screen.getByTestId('archive-side');
		expect(side.textContent).toContain('What is this for?');
		expect(side.textContent).toContain('Recurring events stop here');
		expect(side.textContent).toContain('Nothing links here');
	});

	it('offers the way back to the calendar the third card names', () => {
		render(ArchiveScreen, { data: archiveData() });
		expect(screen.getByTestId('archive-side').querySelector('a[href="/calendar"]')).toBeTruthy();
	});

	it('keeps the side column beside the list, not under it', () => {
		render(ArchiveScreen, { data: archiveData() });
		const layout = screen.getByTestId('archive-layout');
		expect(layout.className).toContain('lg:grid-cols-[minmax(0,1fr)_19rem]');
		expect(layout.children).toHaveLength(2);
	});
});

describe('Archive page — the gate states real numbers (125 note)', () => {
	afterEach(cleanup);

	it('does not invent a 30-day window when the gate is closed', () => {
		render(ArchiveScreen, {
			data: archiveData({
				archiveAllowed: false,
				events: [],
				reason: 'Archive view is not included on your plan.'
			})
		});
		expect(screen.getByText(/look back 365 days/i)).toBeTruthy();
		expect(screen.queryByText(/events from 30 days ago/i)).toBeNull();
		expect(screen.getByText(/not included on your plan/i)).toBeTruthy();
	});

	it('draws no track when the plan keeps nothing', () => {
		// archivedRetentionDays 0 means the second band is empty, not negative —
		// and with no total there is no track to fill at all.
		render(ArchiveScreen, { data: archiveData({ archivedRetentionDays: 0 }) });
		expect(screen.queryByTestId('retention-track-fill')).toBeNull();
	});
});
