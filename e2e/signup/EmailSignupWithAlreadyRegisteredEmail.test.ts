import { test, expect } from '@playwright/test';
import { createAccount, deleteAccount, getAccount } from '../../src/lib/server/db/actions/accounts';
import { deleteUserByEmail, getUser } from '../../src/lib/server/db/actions/users';
import { deleteCodesByEmail } from '../../src/lib/server/db/actions/codes';
import { db } from '../../src/lib/server/db';
import { createNewUser } from '../../src/lib/server/utils/createNewUser';
import { calendars, users } from '../../src/lib/server/db/schema';
import { SignUpPage } from '../pageObjects/signup';
import { eq } from 'drizzle-orm';

const firstName = 'test';
const lastName = 'alreadyregistered';
const email = 'emailAlreadyRegistered@familyplanz.com';

let uid = '';

test.beforeEach(async () => {
	const user = await createNewUser(firstName, lastName, email);
	uid = user.id;
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

test.skip('Email Sign Up With Already Registered Email', async ({ page }) => {
	const signUpPage = new SignUpPage(page);
	await test.step('Navigate to the page', async () => {
		await page.goto('/signup');
	});

	await test.step('Fill form with already registered email and submit', async () => {
		await signUpPage.firstNameInput.fill(firstName);
		await signUpPage.lastNameInput.fill(lastName);
		await signUpPage.emailInput.fill(email);
		await signUpPage.signupButton.click();
	});

	await test.step('Expect error message about email already exists', async () => {
		await page.waitForTimeout(2000);
		const errorMessage = page.getByText(/already registered|already exists|already in use/i);
		await expect(errorMessage).toBeVisible({ timeout: 5000 });
	});
});