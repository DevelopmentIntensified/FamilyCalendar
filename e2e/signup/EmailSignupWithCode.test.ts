import { test, expect } from '@playwright/test';
import { deleteAccount, getAccount } from '../../src/lib/server/db/actions/accounts';
import { deleteUserByEmail, getUser } from '../../src/lib/server/db/actions/users';
import { deleteCodesByEmail, getCodesByEmail } from '../../src/lib/server/db/actions/codes';
import { db } from '../../src/lib/server/db';
import { calendars, users } from '../../src/lib/server/db/schema';
import { SignUpPage } from '../pageObjects/signup';
import { eq } from 'drizzle-orm';

const firstName = 'test';
const lastName = 'signupwithcode';
const email = 'emailSignUpWithCode@familyplanz.com';

test.afterEach(async () => {
	const user = await db.select().from(users).where(eq(users.email, email));
	await db.delete(calendars).where(eq(calendars.ownerId, user[0].id));
	await deleteAccount(email);
	await deleteUserByEmail(email);
	await deleteCodesByEmail(email);
});

test('Email Sign Up With Code', async ({ page }) => {
	const signUpPage = new SignUpPage(page);
	await test.step('Navigate to the page', async () => {
		await page.goto('/signup');
	});

	await test.step('Fill out form and submit', async () => {
		await signUpPage.firstNameInput.fill(firstName);
		await signUpPage.lastNameInput.fill(lastName);
		await signUpPage.emailInput.fill(email);
		await signUpPage.signupButton.click();
	});

	const signUpCode = await test.step('Check that an email was sent', async () => {
		await page.waitForTimeout(3000);
		const codes = await getCodesByEmail(email);
		console.warn('DEBUGPRINT[19]: EmailSignupWithCode.test.ts:32: codes=', codes);

		expect(codes.length).toBe(1);
		const emailId = codes[0].emailId;
		console.warn('DEBUGPRINT[20]: EmailSignupWithCode.test.ts:36: emailId=', emailId);
		expect(emailId).not.toBeNull();
		return codes[0].code;
	});

	await test.step('Login with link and go to calendar page', async () => {
		await signUpPage.verificationInput.fill(signUpCode);
		await signUpPage.verificationCodeButton.click();

		await page.waitForURL('/calendar');
	});

	await test.step('Verify that the user was created', async () => {
		const account = await getAccount(email);
		const user = await getUser(account.userId);

		expect(account.provider).toBe('email');

		expect(user.firstName).toBe(firstName);
		expect(user.lastName).toBe(lastName);
		expect(user.email).toBe(email);
		expect(user.emailVerified).toBe(true);
	});

	await test.step('Verify that the user was logged In', async () => {
		const cookies = await page.context().cookies();

		const authCookie = cookies.find((e) => e.name === 'auth_session');
		expect(authCookie).not.toBeFalsy();
	});
});
