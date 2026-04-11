import { test, expect } from '@playwright/test';
import { createAccount, deleteAccount, getAccount } from '../../src/lib/server/db/actions/accounts';
import { createUser, deleteUser, getUser } from '../../src/lib/server/db/actions/users';
import { deleteCodesByEmail, getCodesByEmail } from '../../src/lib/server/db/actions/codes';
import { db } from '../../src/lib/server/db';
import { calendars, users } from '../../src/lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { LoginPage } from '../pageObjects/login';
import { EventPage } from '../pageObjects/event';
import { createNewUser } from '../../src/lib/server/utils/createNewUser';

const firstName = 'test';
const lastName = 'eventcreation';
const email = 'eventcreation@familyplanz.com';

let uid = '';

test.beforeEach(async () => {
	let user = await createNewUser(firstName, lastName, email);
	uid = user.id;
});

test.afterEach(async () => {
	const user = await db.select().from(users).where(eq(users.email, email));
	await db.delete(calendars).where(eq(calendars.ownerId, user[0].id));
	await deleteAccount(email);
	await deleteUser(uid);
	await deleteCodesByEmail(email);
});

test('Event Creation', async ({ page }) => {
	const loginPage = new LoginPage(page);
	const eventPage = new EventPage(page);

	await test.step('Login', async () => {
		await loginPage.goto();
		await loginPage.emailInput.fill(email);
		await loginPage.signupButton.click();
		await page.waitForTimeout(5000);
		const codes = await getCodesByEmail(email);
		const signUpCode = codes[0].code;
		await loginPage.verificationInput.fill(signUpCode);
		await loginPage.verificationCodeButton.click();
		await page.waitForURL('/calendar');
	});

	await test.step('Navigate to create event page', async () => {
		await eventPage.gotoNewEvent();
	});

	const now = new Date();
	now.setHours(now.getHours() + 2);
	const startDateTime = now.toISOString().slice(0, 16);
	now.setHours(now.getHours() + 1);
	const endDateTime = now.toISOString().slice(0, 16);

	await test.step('Fill out event form', async () => {
		await eventPage.fillForm({
			title: 'Test Event',
			start: startDateTime,
			end: endDateTime,
			location: 'Test Location',
			description: 'Test Description'
		});
	});

	await test.step('Submit form', async () => {
		await eventPage.submitCreate();
	});

	await test.step('Verify redirect to calendar', async () => {
		await page.waitForURL('/calendar');
	});

	await test.step('Verify event appears on calendar', async () => {
		await expect(page.getByText('Test Event')).toBeVisible();
	});
});