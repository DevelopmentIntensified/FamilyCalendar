import { test, expect, loginWithSession } from '../testUtils';
import { db } from '$lib/server/db';
import { tasks, taskCompletions, users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { createNewUser } from '$lib/server/utils/createNewUser';

/**
 * 093, mark 3: "the month totals box and whatever sits beside it must be the
 * same MEASURED height ... Pin it in a test so it cannot drift again."
 *
 * This is that test. It is an e2e test on purpose: equal height is a layout
 * measurement, and jsdom has no layout engine, so a jsdom test could only
 * assert the classes and hope. This one reads the rendered geometry.
 */
test.describe('Task stats page — the measured row (093)', () => {
	test('the totals box and the two assignment lists render the same height', async ({
		page,
		testUser
	}) => {
		// Five DIFFERENT assigners, so "Assigned you the most" is five rows
		// against the totals box's three figures. The boxes then genuinely
		// differ in content, and equal height is the grid's doing rather than an
		// accident of two near-identical boxes. One helper assigning five tasks
		// groups into a single row and would prove nothing.
		const helpers = await Promise.all(
			Array.from({ length: 5 }, (_, i) =>
				createNewUser(
					'Helper',
					String.fromCharCode(65 + i),
					`stats-height-${Date.now()}-${i}@example.com`
				)
			)
		);
		await db.insert(tasks).values(
			helpers.map((helper, i) => ({
				title: `Assigned chore number ${i + 1}`,
				userId: helper.id,
				assignedTo: testUser.uid,
				completedAt: new Date().toISOString(),
				completionCount: 1
			}))
		);
		// One completion row so the streak leg (the only read of the immutable
		// taskCompletions table) has something to chew on.
		const [mine] = await db.select().from(tasks).where(eq(tasks.assignedTo, testUser.uid)).limit(1);
		if (mine) {
			await db.insert(taskCompletions).values({
				taskId: mine.id,
				userId: testUser.uid,
				actorId: testUser.uid,
				completedAt: new Date().toISOString()
			});
		}

		try {
			await page.setViewportSize({ width: 1280, height: 900 });
			await loginWithSession(page, testUser.email);
			await page.goto('/calendar/stats');

			const row = page.getByTestId('stats-equal-row');
			await expect(row).toBeVisible();

			const boxes = row.locator(':scope > *');
			await expect(boxes).toHaveCount(3);

			// The measurement, read off the rendered geometry rather than off
			// the class list.
			const measurements = await boxes.evaluateAll((nodes) =>
				nodes.map((node) => {
					const rect = node.getBoundingClientRect();
					return {
						label: node.querySelector('h2')?.textContent?.trim() ?? '?',
						height: Math.round(rect.height * 100) / 100,
						rows: node.querySelectorAll('li').length
					};
				})
			);

			console.log('093 measured row heights (1280x900):', measurements);

			const heights = measurements.map((m) => m.height);
			// Sub-pixel only: the grid gives every item the same row height, and
			// the browser may land a fraction either side of it.
			expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(0.5);
		} finally {
			for (const helper of helpers) {
				await db.delete(tasks).where(eq(tasks.userId, helper.id));
				await db.delete(users).where(eq(users.id, helper.id));
			}
		}
	});
});
