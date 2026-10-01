import { test, expect, loginWithSession } from '../testUtils';
import { db } from '$lib/server/db';
import { calendars, events } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

function daysAgo(n: number) {
	return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * 094: "Give the month header card real internal padding, MEASURED against the
 * other cards on the page rather than by eye."
 *
 * jsdom has no layout engine, so the padding cannot be measured there — this
 * reads the rendered computed style. The card that carries the mark is the one
 * under the month header, and it must not be the tighter of the two.
 */
test.describe('Archive page — the month card padding (094)', () => {
	test('the month card is padded at least as much as the cards it heads', async ({
		page,
		testUser
	}) => {
		const [calendar] = await db.select().from(calendars).where(eq(calendars.ownerId, testUser.uid));
		expect(calendar, 'test user has a personal calendar').toBeTruthy();

		// Two months, so the grouping is exercised, and both are past the free
		// tier's 30-day look-back so the gate opens.
		await db.insert(events).values([
			{
				title: 'Autumn term starts',
				calendarId: calendar.id,
				ownerId: testUser.uid,
				start: daysAgo(70),
				end: daysAgo(70)
			},
			{
				title: 'Bonfire night',
				calendarId: calendar.id,
				ownerId: testUser.uid,
				start: daysAgo(62),
				end: daysAgo(62)
			},
			{
				title: 'Half term',
				calendarId: calendar.id,
				ownerId: testUser.uid,
				start: daysAgo(45),
				end: daysAgo(45)
			}
		]);

		try {
			await page.setViewportSize({ width: 1280, height: 900 });
			await loginWithSession(page, testUser.email);
			await page.goto('/calendar/archive');

			const month = page.getByTestId('archive-month').first();
			await expect(month).toBeVisible();
			await expect(page.getByTestId('archive-event').first()).toBeVisible();

			const padding = await page.evaluate(() => {
				const read = (selector: string) => {
					const node = document.querySelector(selector);
					if (!node) return null;
					const style = getComputedStyle(node);
					return {
						top: parseFloat(style.paddingTop),
						right: parseFloat(style.paddingRight),
						bottom: parseFloat(style.paddingBottom),
						left: parseFloat(style.paddingLeft)
					};
				};
				return {
					month: read('[data-testid="archive-month"]'),
					event: read('[data-testid="archive-event"]')
				};
			});

			console.log('094 measured card padding:', padding);

			expect(padding.month).not.toBeNull();
			expect(padding.event).not.toBeNull();
			for (const side of ['top', 'right', 'bottom', 'left'] as const) {
				expect(padding.month![side]).toBeGreaterThanOrEqual(padding.event![side]);
				expect(padding.month![side]).toBeGreaterThan(0);
			}
		} finally {
			await db.delete(events).where(eq(events.ownerId, testUser.uid));
		}
	});
});
