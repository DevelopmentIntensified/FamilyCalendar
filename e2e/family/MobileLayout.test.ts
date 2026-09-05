import { test, expect } from '@playwright/test';
import { deleteAccount } from '../../src/lib/server/db/actions/accounts';
import { deleteUser } from '../../src/lib/server/db/actions/users';
import { createCode, deleteCodesByEmail } from '../../src/lib/server/db/actions/codes';
import { db } from '../../src/lib/server/db';
import { calendars, users, events, families, familyMembers, tasks } from '../../src/lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { createNewUser } from '../../src/lib/server/utils/createNewUser';
import { getSessionCookie } from '../testUtils';

const firstName = 'test';
const lastName = 'mobileLay';
const email = 'mobilelay' + Date.now() + '@familyplanz.com';

let uid = '';
let famId = '';

test.beforeAll(async () => {
	const existingUser = await db.select().from(users).where(eq(users.email, email));
	if (existingUser[0]) {
		await db.delete(events).where(eq(events.ownerId, existingUser[0].id));
		await db.delete(calendars).where(eq(calendars.ownerId, existingUser[0].id));
		await deleteAccount(email);
		await deleteUser(existingUser[0].id);
		await deleteCodesByEmail(email);
	}
	const user = await createNewUser(firstName, lastName, email);
	uid = user.id;
	const uniqueCode = Math.random().toString(36).substring(2, 10);
	await createCode({
		code: uniqueCode,
		expiresAt: new Date(Date.now() + 1000 * 60 * 15),
		email,
		firstName,
		lastName,
		emailId: null
	});

	// Seed a family + membership so the list/roster/tasks render populated.
	const [fam] = await db.insert(families).values({ name: 'The Petkes', color: '#22C55E' }).returning();
	famId = fam.id;
	await db.insert(familyMembers).values({ userId: uid, familyId: fam.id, role: 'owner', memberType: 'parent' });
	await db.insert(tasks).values({
		title: 'Take out the recycling',
		userId: uid,
		familyId: fam.id,
		dueDate: '2026-09-04T18:00:00',
		recurrenceFrequency: 'weekly',
		recurrenceInterval: 1,
		priority: 'normal'
	});
});

test.afterAll(async () => {
	if (famId) {
		await db.delete(families).where(eq(families.id, famId));
	}
	const user = await db.select().from(users).where(eq(users.email, email));
	if (user[0]) {
		await db.delete(events).where(eq(events.ownerId, user[0].id));
		await db.delete(tasks).where(eq(tasks.userId, uid));
		await db.delete(calendars).where(eq(calendars.ownerId, user[0].id));
		await deleteAccount(email);
		await deleteUser(uid);
		await deleteCodesByEmail(email);
	}
});

/** Elements sticking past the right viewport edge (empty = no overflow). */
async function overflowReport(page: any) {
	return page.evaluate(() => {
		const vw = window.innerWidth;
		const bad: { tag: string; cls: string; title: string; right: number }[] = [];
		for (const el of Array.from(document.querySelectorAll('body *'))) {
			const r = (el as HTMLElement).getBoundingClientRect();
			if (r.right > vw + 0.5) {
				bad.push({
					tag: el.tagName.toLowerCase(),
					cls: ((el as HTMLElement).className || '').toString().slice(0, 90),
					title: (el as HTMLElement).title || (el as HTMLElement).textContent?.trim().slice(0, 40) || '',
					right: Math.round(r.right * 10) / 10
				});
			}
		}
		return { vw, scrollW: document.documentElement.scrollWidth, bad: bad.slice(0, 12) };
	});
}

const FAMILY_PAGES = ['/family', '/family/create', '/family/tasks', '/family/invitations'];

test('family pages have no horizontal overflow on mobile widths', async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 667 });
	const cookie = await getSessionCookie(email);
	await page.context().addCookies([
		{
			name: cookie.name,
			value: cookie.value,
			domain: 'localhost',
			path: '/',
			httpOnly: cookie.attributes.httpOnly,
			secure: cookie.attributes.secure,
			sameSite: 'Lax'
		}
	]);

	// 320px is the hard floor for small phones; check both widths.
	for (const width of [320, 375]) {
		await page.setViewportSize({ width, height: 700 });

		for (const path of FAMILY_PAGES) {
			await page.goto(path);
			await page.waitForLoadState('networkidle');
			const rep = await overflowReport(page);
			expect(rep.scrollW, `${path} @ ${width}px scrollWidth`).toBeLessThanOrEqual(rep.vw + 1);
			expect(rep.bad, `${path} @ ${width}px overflowing elements`).toEqual([]);
		}

		// Family dashboard (seeded family) + its task board + member add page.
		await page.goto('/family');
		await page.waitForLoadState('networkidle');
		await page.locator('a:has-text("View Details")').first().click();
		await page.waitForLoadState('networkidle');
		const rep = await overflowReport(page);
		expect(rep.scrollW, `family dashboard @ ${width}px scrollWidth`).toBeLessThanOrEqual(rep.vw + 1);
		expect(rep.bad, `family dashboard @ ${width}px overflowing elements`).toEqual([]);

		await page.goto(`/family/${famId}/tasks`);
		await page.waitForLoadState('networkidle');
		const repTasks = await overflowReport(page);
		expect(repTasks.scrollW, `family tasks @ ${width}px scrollWidth`).toBeLessThanOrEqual(repTasks.vw + 1);
		expect(repTasks.bad, `family tasks @ ${width}px overflowing elements`).toEqual([]);

		await page.goto(`/family/${famId}/members/add`);
		await page.waitForLoadState('networkidle');
		const repAdd = await overflowReport(page);
		expect(repAdd.scrollW, `members/add @ ${width}px scrollWidth`).toBeLessThanOrEqual(repAdd.vw + 1);
		expect(repAdd.bad, `members/add @ ${width}px overflowing elements`).toEqual([]);
	}

	// Specific checks for the two previously-fixed spots.
	await page.setViewportSize({ width: 375, height: 667 });
	await page.goto('/family');
	await page.waitForLoadState('networkidle');
	const ctaBox = await page.locator('a:has-text("Create New Family")').boundingBox();
	expect(ctaBox!.x + ctaBox!.width).toBeLessThanOrEqual(375);

	await page.goto('/family/create');
	await page.waitForLoadState('networkidle');
	const swatchBox = await page.locator('button[title="Rose"]').boundingBox();
	expect(swatchBox!.x + swatchBox!.width).toBeLessThanOrEqual(375);
});