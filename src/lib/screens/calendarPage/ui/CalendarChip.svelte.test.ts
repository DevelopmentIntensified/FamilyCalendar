/**
 * One Event chip: the vocabulary's mark, the row's OWN calendar colour (owner
 * Q-099 B — never a colour picked by list position), the sponsored amber for an
 * ad, the RSVP badge, and Selection mode's checkbox.
 *
 * Doc: ../README.md#chips-colour-and-the-key
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import type { CalendarPageCalendar } from '../calendarPage.contract';
import type { CalendarPageDisplayRow } from '../calendarPage.state.svelte';
import CalendarChip from './CalendarChip.svelte';

const CALENDARS: readonly CalendarPageCalendar[] = [
	{ id: 'personal', name: 'Personal Calendar', color: '#fa8072', kind: 'personal' },
	{ id: 'family', name: 'Riveras', color: '#e0ffff', kind: 'family' }
];

function row(overrides: Partial<CalendarPageDisplayRow> = {}): CalendarPageDisplayRow {
	return {
		id: 'e1',
		masterId: null,
		occurrenceDate: null,
		title: 'Piano',
		description: null,
		location: null,
		date: '2026-03-10',
		start: '2026-03-10T10:00:00.000Z',
		end: null,
		allDay: false,
		calendarId: 'personal',
		ownerId: 'me',
		creatorName: null,
		rsvpStatus: null,
		attendance: null,
		recurrenceFrequency: null,
		isAd: false,
		...overrides
	};
}

afterEach(cleanup);

describe('CalendarChip', () => {
	it('tints by calendarId, not by list position', () => {
		// The family calendar is index 1 here; a positional rule would hand it
		// the personal colour when the personal calendar is missing.
		render(CalendarChip, {
			props: { row: row({ calendarId: 'family' }), calendars: CALENDARS, density: 'glyph' }
		});
		const chip = screen.getByRole('button', { name: /Piano/ });
		expect(chip.getAttribute('style')).toMatch(/--chip-color:\s*#e0ffff/);
	});

	it('wears the sponsored amber and the hatch when it belongs to no calendar', () => {
		render(CalendarChip, {
			props: {
				row: row({ title: 'Toy drive', calendarId: null, allDay: true, isAd: true }),
				calendars: CALENDARS,
				density: 'glyph'
			}
		});
		const chip = screen.getByRole('button', { name: /Toy drive/ });
		expect(chip.dataset.chipKind).toBe('sponsored');
		expect(chip.getAttribute('style')).toMatch(/--chip-color:\s*#f59e0b/);
		expect(chip.getAttribute('style')).toContain('background-image');
	});

	it('opens on tap, and toggles instead in Selection mode', async () => {
		const onopen = vi.fn();
		const onselect = vi.fn();
		render(CalendarChip, {
			props: {
				row: row(),
				calendars: CALENDARS,
				density: 'word',
				onopen,
				onselect,
				selectionMode: false
			}
		});
		screen.getByRole('button', { name: /Piano/ }).click();
		expect(onopen).toHaveBeenCalledTimes(1);
		expect(onselect).not.toHaveBeenCalled();
	});

	it('shows the RSVP badge, and hides it in Selection mode', () => {
		const { unmount } = render(CalendarChip, {
			props: { row: row({ rsvpStatus: 'going' }), calendars: CALENDARS, density: 'glyph' }
		});
		expect(screen.getByRole('button', { name: /Piano/ })).toHaveTextContent('✓');
		unmount();

		render(CalendarChip, {
			props: {
				row: row({ rsvpStatus: 'going' }),
				calendars: CALENDARS,
				density: 'glyph',
				selectionMode: true,
				selected: true
			}
		});
		const chip = screen.getByRole('button', { name: /Piano/ });
		expect(chip).not.toHaveTextContent('✓');
		expect(chip.getAttribute('aria-pressed')).toBe('true');
		expect(chip.className).toContain('ring-2');
	});
});
