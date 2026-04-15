import { test, expect } from '@playwright/test';
import { db } from '$lib/server/db';
import { families, familyMembers, users, calendars } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { getSessionCookie } from '../testUtils';
import { createFamily } from '$lib/server/db/actions/families';
import { deleteAccount } from '$lib/server/db/actions/accounts';
import { deleteUser } from '$lib/server/db/actions/users';
import { deleteCodesByEmail } from '$lib/server/db/actions/codes';

const ownerEmail = 'delivered+owner' + Date.now() + '@resend.dev';
let ownerId = '';
let familyId = '';

test.beforeEach(async () => {
	const existing = await db.select().from(users).where(eq(users.email, ownerEmail));
	if (existing[0]) {
		await db.delete(familyMembers).where(eq(familyMembers.userId, existing[0].id));
		await db.delete(calendars).where(eq(calendars.ownerId, existing[0].id));
		await db.delete(families).where(eq(families.id, familyId));
		await deleteCodesByEmail(ownerEmail);
		await deleteUser(existing[0].id);
	}
	
	const ownerUser = await import('$lib/server/utils/createNewUser').then(m => m.createNewUser('Test', 'Owner', ownerEmail));
	ownerId = ownerUser.id;
	
	const family = await createFamily({ name: 'Test Family', color: '#3b82f6' });
	familyId = family.id;
	
	await db.insert(familyMembers).values({ userId: ownerId, familyId, role: 'admin' });
});

test.afterEach(async () => {
	const user = await db.select().from(users).where(eq(users.email, ownerEmail));
	if (user[0]) {
		await db.delete(familyMembers).where(eq(familyMembers.userId, user[0].id));
		await db.delete(calendars).where(eq(calendars.ownerId, user[0].id));
		await db.delete(families).where(eq(families.id, familyId));
		await deleteCodesByEmail(ownerEmail);
		await deleteUser(user[0].id);
		await deleteAccount(ownerEmail);
	}
});

test('Family settings - rename family', async ({ page }) => {
	await test.step('Setup session', async () => {
		const cookie = await getSessionCookie(ownerEmail);
		await page.context().addCookies([{
			name: cookie.name,
			value: cookie.value,
			domain: 'localhost',
			path: '/',
			httpOnly: cookie.attributes.httpOnly,
			secure: cookie.attributes.secure,
			sameSite: 'Lax'
		}]);
	});

	await test.step('Navigate to family page', async () => {
		await page.goto('/family/' + familyId);
		await page.waitForLoadState('networkidle');
	});

	await test.step('Open settings', async () => {
		await page.click('button:has-text("Settings")');
	});

	await test.step('Check settings form visible', async () => {
		await page.waitForSelector('input[name="name"]');
		await page.waitForSelector('input[name="color"]');
	});

	await test.step('Update family name', async () => {
		await page.fill('input[name="name"]', 'Updated Family Name');
		await page.click('button:has-text("Save Changes")');
		await page.waitForTimeout(1000);
	});

	await test.step('Verify name updated in DB', async () => {
		const [updated] = await db.select().from(families).where(eq(families.id, familyId));
		expect(updated.name).toBe('Updated Family Name');
	});
});

test('Family settings - change color', async ({ page }) => {
	await test.step('Setup session', async () => {
		const cookie = await getSessionCookie(ownerEmail);
		await page.context().addCookies([{
			name: cookie.name,
			value: cookie.value,
			domain: 'localhost',
			path: '/',
			httpOnly: cookie.attributes.httpOnly,
			secure: cookie.attributes.secure,
			sameSite: 'Lax'
		}]);
	});

	await test.step('Navigate to family page', async () => {
		await page.goto('/family/' + familyId);
		await page.waitForLoadState('networkidle');
	});

	await test.step('Open settings', async () => {
		await page.click('button:has-text("Settings")');
	});

	await test.step('Check settings form visible', async () => {
		await page.waitForSelector('input[name="name"]');
		await page.waitForSelector('input[name="color"]');
	});

	await test.step('Update color', async () => {
		await page.fill('input[name="color"]', '#ef4444');
		await page.click('button:has-text("Save Changes")');
		await page.waitForTimeout(1000);
	});

	await test.step('Verify color updated in DB', async () => {
		const [updated] = await db.select().from(families).where(eq(families.id, familyId));
		expect(updated.color).toBe('#ef4444');
	});
});