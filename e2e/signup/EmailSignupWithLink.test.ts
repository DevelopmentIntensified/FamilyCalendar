import { RESEND_API } from '../globals';
import { test, expect } from '@playwright/test';
import { deleteAccount, getAccount } from '../../src/lib/server/db/actions/accounts';
import { deleteUserByEmail, getUser } from '../../src/lib/server/db/actions/users';
import { deleteCodesByEmail, getCodesByEmail } from '../../src/lib/server/db/actions/codes';
import { db } from '../../src/lib/server/db';
import { calendars, users } from '../../src/lib/server/db/schema';
import { SignUpPage } from '../pageObjects/signup';
import { Resend } from 'resend';
import { eq } from 'drizzle-orm';

const resend = new Resend(RESEND_API);

const firstName = 'test';
const lastName = 'signupwithlink';
const email = 'emailSignUpWithLink@familyplanz.com';

test.afterEach(async () => {
	const user = await db.select().from(users).where(eq(users.email, email));
	await db.delete(calendars).where(eq(calendars.ownerId, user[0].id));
	await deleteAccount(email);
	await deleteUserByEmail(email);
	await deleteCodesByEmail(email);
});

test('Email Sign Up With Link', async ({ page }) => {
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

	const signUpLink = await test.step('Check that an email was sent', async () => {
		await page.waitForTimeout(3000);
		const codes = await getCodesByEmail(email);

		expect(codes.length).toBe(1);
		const emailId = codes[0].emailId;
		expect(emailId).not.toBeNull();

		const emailSent = await resend.emails.get(emailId);
		const emailHtml = emailSent.data?.html;
		const signUpLink = emailHtml?.match(/href="(.*)"/);

		expect(signUpLink).not.toBeFalsy();

		if (signUpLink?.length) {
			return signUpLink[1];
		}
	});

	await test.step('Login with link and go to calendar page', async () => {
		await page.goto(signUpLink as string);
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
