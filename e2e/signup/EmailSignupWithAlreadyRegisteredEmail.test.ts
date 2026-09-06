import { test, expect } from '@playwright/test';
import { deleteAccount } from '../../src/lib/server/db/actions/accounts';
import { deleteUserByEmail } from '../../src/lib/server/db/actions/users';
import { deleteCodesByEmail } from '../../src/lib/server/db/actions/codes';
import { db } from '../../src/lib/server/db';
import { createNewUser } from '../../src/lib/server/utils/createNewUser';
import { calendars, users } from '../../src/lib/server/db/schema';
import { SignUpPage } from '../pageObjects/signup';
import { eq } from 'drizzle-orm';

const firstName = 'test';
const lastName = 'alreadyregistered';
const email = 'delivered+alreadyregistered' + Date.now() + '@resend.dev';

test.beforeEach(async () => {
	await createNewUser(firstName, lastName, email);
});

test.afterEach(async () => {
	const user = await db.select().from(users).where(eq(users.email, email));
	if (user[0]) {
		await db.delete(calendars).where(eq(calendars.ownerId, user[0].id));
	}
	await deleteAccount(email);
	await deleteUserByEmail(email);
	await deleteCodesByEmail(email);
});

test('Email Sign Up With Already Registered Email', async ({ page }) => {
	const signUpPage = new SignUpPage(page);
	await test.step('Navigate to the page', async () => {
		await page.goto('/signup');
	});

	await test.step('Switch to email mode and fill form with already registered email', async () => {
		await signUpPage.emailModeButton.click();
		await signUpPage.firstNameInput.fill(firstName);
		await signUpPage.lastNameInput.fill(lastName);
		await signUpPage.emailInput.fill(email);
		await signUpPage.sendLinkButton.click();
	});

	await test.step('Registered email is masked: same success UI as new email', async () => {
		// Enumeration fix: the API returns the identical happy-path response for
		// registered emails — no code is created, but the UI cannot tell.
		await page.waitForTimeout(2000);
		const successMessage = page.getByText(/verification code/i);
		await expect(successMessage).toBeVisible({ timeout: 5000 });
		const errorMessage = page.getByText(/already registered|already exists|already in use/i);
		await expect(errorMessage).toHaveCount(0);
	});
});
