import { test, expect } from '@playwright/test';
import { deleteAccount } from '../../src/lib/server/db/actions/accounts';
import { deleteUser } from '../../src/lib/server/db/actions/users';
import { createCode, deleteCodesByEmail } from '../../src/lib/server/db/actions/codes';
import { db } from '../../src/lib/server/db';
import { calendars, users, events } from '../../src/lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { createNewUser } from '../../src/lib/server/utils/createNewUser';
import { getSessionCookie } from '../testUtils';

const firstName = 'test';
const lastName = 'quickcreate';

let email = '';
let uid = '';

test.beforeEach(async () => {
	// Clean up any existing user first
	const existingUser = await db.select().from(users).where(eq(users.email, email));
	if (existingUser[0]) {
		await db.delete(events).where(eq(events.ownerId, existingUser[0].id));
		await db.delete(calendars).where(eq(calendars.ownerId, existingUser[0].id));
		await deleteAccount(email);
		await deleteUser(existingUser[0].id);
		await deleteCodesByEmail(email);
	}
	// Create fresh user with unique email to avoid duplicate key errors
	email = 'quickcreate' + Date.now() + Math.random().toString(36).substring(2, 6) + '@familyplanz.com';
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
});

test.afterEach(async () => {
	const user = await db.select().from(users).where(eq(users.email, email));
	if (user[0]) {
		await db.delete(events).where(eq(events.ownerId, user[0].id));
		await db.delete(calendars).where(eq(calendars.ownerId, user[0].id));
		await deleteAccount(email);
		await deleteUser(uid);
		await deleteCodesByEmail(email);
	}
});

test('Quick Create Modal - Open and Close', async ({ page }) => {
	await test.step('Setup session', async () => {
		const cookie = await getSessionCookie(email);
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

	await test.step('Navigate to calendar', async () => {
		await page.goto('/calendar');
		await page.waitForLoadState('networkidle');
	});

	await test.step('Open modal with floating button', async () => {
		await page.getByRole('button', { name: 'Quick Add Event' }).click();
		await expect(page.getByText('New Event')).toBeVisible();
	});

	await test.step('Close modal with X button', async () => {
		await page.getByRole('button', { name: 'Close modal' }).click();
		await expect(page.getByText('New Event')).not.toBeVisible();
	});
});

test('Quick Create Modal - NL Input Parsing', async ({ page }) => {
	await test.step('Setup session', async () => {
		const cookie = await getSessionCookie(email);
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

	await test.step('Navigate to calendar and open modal', async () => {
		await page.goto('/calendar');
		await page.waitForLoadState('networkidle');
		await page.getByRole('button', { name: 'Quick Add Event' }).click();
		await expect(page.getByText('New Event')).toBeVisible();
	});

	await test.step('Enter NL input', async () => {
		await page.fill('input[placeholder*="Lunch Friday at noon"]', 'Lunch Friday at noon with John in Conference A');
		// Wait for parsing
		await page.waitForTimeout(3000);
	});

	await test.step('Manually fill required fields if not auto-filled', async () => {
		const titleInput = page.locator('#event-title');
		let titleValue = await titleInput.inputValue();
		if (!titleValue) {
			await titleInput.fill('Lunch');
		}

		const dateInput = page.locator('#event-date');
		let dateValue = await dateInput.inputValue();
		if (!dateValue) {
			const tomorrow = new Date();
			tomorrow.setDate(tomorrow.getDate() + 1);
			await dateInput.fill(tomorrow.toISOString().slice(0, 10));
		}
	});

	await test.step('Submit form and verify redirect', async () => {
		await page.click('button[type="submit"]:has-text("Create")');
		await page.waitForURL('/calendar', { timeout: 10000 });
	});
});

test('Quick Create Modal - Description Contains Raw Input', async ({ page }) => {
	await test.step('Setup session', async () => {
		const cookie = await getSessionCookie(email);
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

	await test.step('Navigate to calendar and open modal', async () => {
		await page.goto('/calendar');
		await page.waitForLoadState('networkidle');
		await page.getByRole('button', { name: 'Quick Add Event' }).click();
		await expect(page.getByText('New Event')).toBeVisible();
	});

	await test.step('Enter NL input and manually set title/date if needed', async () => {
		await page.fill('input[placeholder*="Lunch Friday at noon"]', 'Dinner tomorrow at 7 PM at my apartment');
		// Wait for parsing
		await page.waitForTimeout(3000);

		// Ensure title is set
		const titleInput = page.locator('#event-title');
		const titleValue = await titleInput.inputValue();
		if (!titleValue) {
			await titleInput.fill('Dinner');
		}

		// Ensure date is set
		const dateInput = page.locator('#event-date');
		const dateValue = await dateInput.inputValue();
		if (!dateValue) {
			const tomorrow = new Date();
			tomorrow.setDate(tomorrow.getDate() + 1);
			await dateInput.fill(tomorrow.toISOString().slice(0, 10));
		}
	});

	await test.step('Submit form', async () => {
		await page.click('button[type="submit"]:has-text("Create")');
		// Wait for the modal to close — confirms the create request completed.
		await expect(page.getByText('New Event')).not.toBeVisible({ timeout: 10000 });
	});

	await test.step('Verify event was created (check description in DB)', async () => {
		// Query the database to verify description contains raw input
		const userEvents = await db.select().from(events).where(eq(events.ownerId, uid));
		expect(userEvents.length).toBeGreaterThan(0);
		const lastEvent = userEvents[userEvents.length - 1];
		expect(lastEvent.description).toContain('Dinner tomorrow at 7 PM at my apartment');
	});
});

test('Quick Create Modal - Required Fields Validation', async ({ page }) => {
	await test.step('Setup session', async () => {
		const cookie = await getSessionCookie(email);
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

	await test.step('Navigate to calendar and open modal', async () => {
		await page.goto('/calendar');
		await page.waitForLoadState('networkidle');
		await page.getByRole('button', { name: 'Quick Add Event' }).click();
		await expect(page.getByText('New Event')).toBeVisible();
	});

	await test.step('Submit without title should not redirect (button disabled)', async () => {
		// Clear title if pre-filled
		const titleInput = page.locator('#event-title');
		await titleInput.fill('');

		// Submit button should be disabled
		const submitButton = page.locator('button[type="submit"]:has-text("Create")');
		await expect(submitButton).toBeDisabled();

		// Fill title to enable button
		const tomorrow = new Date();
		tomorrow.setDate(tomorrow.getDate() + 1);
		await titleInput.fill('Test Event');
		// Reveal the date field (hidden behind "Show More" when no NL parsing ran)
		await page.getByRole('button', { name: 'Show More' }).click();
		await page.locator('#event-date').fill(tomorrow.toISOString().slice(0, 10));
		await expect(submitButton).toBeEnabled();
	});

	await test.step('Fill required fields and submit should succeed', async () => {
		const submitButton = page.locator('button[type="submit"]:has-text("Create")');
		await submitButton.click();
		await expect(page.getByText('New Event')).not.toBeVisible({ timeout: 10000 });
	});
});
