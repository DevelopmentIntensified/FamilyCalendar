/**
 * The toolbar as one coherent bar (#326/#327): the Filters/Import/Print/Day
 * dashboard/Settings strip is icon-only (named by aria-label + title), nothing
 * in the header is a scroll container, every control is 40px tall, and narrow
 * widths collapse the strip into the ⋯ button. jsdom does no layout, so the
 * measured `scrollWidth === clientWidth` check at 1280px and 768px is the
 * pages harness's job (visual:check); this pins the classes that guarantee it.
 *
 * Doc: ../README.md#files
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/svelte';
import type { CalendarPageGrid, CalendarPageModel } from '../calendarPage.contract';
import CalendarPage from './CalendarPage.svelte';

afterEach(cleanup);

const emptyGrid: CalendarPageGrid = { events: [], tasks: [], ads: [], warnings: [] };

function model(): CalendarPageModel {
	return {
		shell: {
			viewerId: 'me',
			today: '2026-03-10',
			zone: 'UTC',
			weekStart: 'sunday',
			settings: {
				weekStart: 'sunday',
				defaultView: 'monthView',
				timeZone: 'UTC',
				color: null,
				showAdsAsEvents: false,
				defaultCalendarId: null,
				autoParseEventDetails: null,
				useCloudAI: null
			},
			calendars: [{ id: 'personal', name: 'Personal Calendar', color: '#fa8072', kind: 'personal' }],
			roster: [{ userId: 'me', firstName: 'Mia', lastName: 'R' }],
			seeds: { date: null, view: null, edit: null, create: null },
			warnings: []
		},
		grid: Promise.resolve(emptyGrid)
	};
}

async function toolbar() {
	render(CalendarPage, { props: { model: model(), oninvalidate: async () => {} } });
	return (await screen.findByTestId('toolbar-controls-row')).parentElement as HTMLElement;
}

describe('CalendarToolbar icon strip', () => {
	it('names every icon button after its old label, with a tooltip and no visible word', async () => {
		await toolbar();
		const strip = screen.getByTestId('action-strip');
		const expected: [string, 'button' | 'link'][] = [
			['Filters', 'button'],
			['Import', 'link'],
			['Print', 'link'],
			['Day dashboard', 'link'],
			['Calendar settings', 'link']
		];
		for (const [name, role] of expected) {
			const control = within(strip).getByRole(role, { name });
			expect(control, name).toHaveAttribute('title');
			expect(control.textContent?.trim(), name).toBe('');
			expect(control.querySelector('svg'), name).toBeTruthy();
		}
	});

	it('links the dashboard to the date on screen', async () => {
		await toolbar();
		expect(screen.getByRole('link', { name: 'Day dashboard' })).toHaveAttribute(
			'href',
			'/calendar/dashboard?date=2026-03-10'
		);
	});
});

describe('CalendarToolbar one coherent bar', () => {
	it('has no scroll container anywhere in the header', async () => {
		const root = await toolbar();
		for (const element of root.querySelectorAll('*')) {
			const classes = element.getAttribute('class') ?? '';
			expect(classes, element.tagName).not.toMatch(/\boverflow-x-/);
			expect(classes, element.tagName).not.toMatch(/\boverflow-(auto|scroll)\b/);
		}
	});

	it('gives every control on the bar the same 40px height', async () => {
		await toolbar();
		const controls = [
			screen.getByRole('button', { name: 'Month' }).parentElement, // the view switch
			screen.getByTestId('daynav').querySelector('button'), // the date pill's label
			screen.getByTitle('Add by dragging a time range'),
			screen.getByTitle('Select events to edit in bulk'),
			screen.getByTestId('action-strip'),
			screen.getByTestId('action-menu-trigger'),
			screen.getByRole('searchbox', { name: 'Search events' })
		];
		for (const control of controls) {
			expect(control?.className, control?.tagName).toMatch(/\bh-10\b/);
		}
	});

	it('collapses the strip into the ⋯ button below md instead of scrolling', async () => {
		await toolbar();
		expect(screen.getByTestId('action-strip').className).toMatch(/\bhidden\b.*\bmd:flex\b/);
		const trigger = screen.getByTestId('action-menu-trigger');
		expect(trigger.className).toMatch(/\bmd:hidden\b/);
		expect(trigger).toHaveAttribute('aria-label', 'Calendar actions');
		expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
	});
});
