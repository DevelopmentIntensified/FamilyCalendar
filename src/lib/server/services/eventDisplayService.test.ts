import { describe, it, expect } from 'vitest';
import {
	expandEventsForUser,
	monthGridWindow
} from './eventDisplayService';
import type { CalendarEvent } from '$lib/server/db/schema';

function master(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
	return {
		id: 'm1',
		calendarId: 'c1',
		ownerId: 'u1',
		title: 'Standup',
		start: '2026-09-01T09:00:00Z',
		end: '2026-09-01T09:30:00Z',
		description: null,
		location: null,
		allDay: false,
		recurrenceFrequency: 'daily',
		recurrenceInterval: 1,
		recurrenceByDay: null,
		recurrenceCount: null,
		recurrenceUntil: null,
		reminderMinutes: null,
		mirrorOf: null,
		created_at: new Date('2026-09-01T00:00:00Z'),
		...overrides
	} as CalendarEvent;
}

describe('monthGridWindow', () => {
	it('covers the full month plus a week of padding each side', () => {
		const w = monthGridWindow('2026-09-15');
		expect(w.start <= new Date('2026-09-01T00:00:00Z')).toBe(true);
		expect(w.end >= new Date('2026-09-30T23:59:59Z')).toBe(true);
		// ~44 days, not ~1460
		const days = (w.end.getTime() - w.start.getTime()) / 86400000;
		expect(days).toBeLessThan(60);
	});

	it('falls back to the current month for missing/invalid input', () => {
		const now = new Date();
		for (const input of [undefined, '', 'not-a-date']) {
			const w = monthGridWindow(input);
			expect(w.start <= new Date(now.getFullYear(), now.getMonth(), 1)).toBe(true);
			expect(w.end >= now).toBe(true);
		}
	});
});

describe('expandEventsForUser window', () => {
	it('bounds recurring expansion to the given window', async () => {
		const w = monthGridWindow('2026-09-15');
		const out = await expandEventsForUser([master()], w);
		expect(out.length).toBeGreaterThan(0);
		expect(out.length).toBeLessThan(60);
		for (const o of out) {
			const t = new Date(o.start).getTime();
			expect(t).toBeGreaterThanOrEqual(w.start.getTime());
			expect(t).toBeLessThanOrEqual(w.end.getTime());
		}
	});

	it('keeps the legacy ±2y window when no window is passed', async () => {
		const out = await expandEventsForUser([master()]);
		expect(out.length).toBeGreaterThan(400);
	});
});
