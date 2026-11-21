/**
 * The importer as the e2e catalog sees it (`ready: '[data-testid="import-drop-zone"]'`):
 * the heading, the drop zone's promise, the calendar picker and the statement
 * cards. The flow itself is `calendar.import.state.test.ts`; this pins the
 * frame and the ready selector.
 *
 * Doc: ../../README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import CalendarImportScreen from './CalendarImportScreen.svelte';

afterEach(cleanup);

describe('CalendarImportScreen', () => {
	it('opens on the upload form with its drop zone and the calendar picker', () => {
		render(CalendarImportScreen, {
			data: { calendars: [{ id: 'cal-1', name: 'Personal Calendar' }] }
		});

		expect(screen.getByRole('heading', { name: 'Import a calendar' })).toBeTruthy();
		expect(screen.getByTestId('import-drop-zone')).toBeTruthy();
		expect(screen.getByLabelText('Import into')).toBeTruthy();
		expect(screen.getByText('Drop or choose .ics files')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Preview events' })).toBeTruthy();
	});

	it('keeps the legacy promise that nothing is added before the commit', () => {
		render(CalendarImportScreen, {
			data: { calendars: [{ id: 'cal-1', name: 'Personal Calendar' }] }
		});

		expect(
			screen.getByText('Nothing is added until you tick the events you want and confirm.')
		).toBeTruthy();
	});
});
