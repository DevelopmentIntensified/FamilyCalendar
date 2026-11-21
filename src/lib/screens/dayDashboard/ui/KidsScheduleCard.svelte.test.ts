/**
 * Kids' Schedule: one band per child, a shared event under both, all-day rows
 * first, and the empty copy that differs for today. Props only.
 *
 * Doc: ../README.md#invariants
 */
import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import KidsScheduleCard from './KidsScheduleCard.svelte';
import type { DashboardKidsEventRow } from '../dayDashboard.contract';

afterEach(cleanup);

function event(overrides: Partial<DashboardKidsEventRow> = {}): DashboardKidsEventRow {
	return {
		id: 'event-soccer~2026-11-02T15:00:00.000Z',
		title: 'Soccer',
		start: '2026-11-02T15:00:00.000Z',
		end: '2026-11-02T16:00:00.000Z',
		allDay: false,
		location: 'Field 2',
		kids: [{ id: 'user-mia', name: 'Mia' }],
		...overrides
	};
}

describe("KidsScheduleCard", () => {
	it("says nobody has anything on, differently for today and a past day", () => {
		render(KidsScheduleCard, { props: { events: [], isToday: true } });
		expect(screen.getByText("No kids' events today — free afternoon!")).toBeTruthy();
		cleanup();
		render(KidsScheduleCard, { props: { events: [], isToday: false } });
		expect(screen.getByText("No kids' events this day")).toBeTruthy();
	});

	it('repeats a shared event under every child attending it', () => {
		render(KidsScheduleCard, {
			props: {
				events: [
					event({
						kids: [
							{ id: 'user-mia', name: 'Mia' },
							{ id: 'user-noah', name: 'Noah' }
						]
					})
				],
				isToday: true
			}
		});
		expect(screen.getByRole('region', { name: 'Mia' })).toBeTruthy();
		expect(screen.getByRole('region', { name: 'Noah' })).toBeTruthy();
		expect(screen.getAllByText('Soccer')).toHaveLength(2);
	});

	it("prints All day for an all-day event and initials from the name", () => {
		render(KidsScheduleCard, {
			props: {
				events: [event({ allDay: true, kids: [{ id: 'user-mia', name: 'Mia Rivera' }] })],
				isToday: true
			}
		});
		expect(screen.getByText('All day')).toBeTruthy();
		expect(screen.getByText('MR')).toBeTruthy();
	});
});
