import { test, expect } from "@playwright/test";
import { createAccount, deleteAccount, getAccount } from "../../src/lib/server/db/actions/accounts"
import { generateId } from "lucia";
import { createUser, deleteUser, getUser } from "../../src/lib/server/db/actions/users"
import { deleteCodesByEmail, getCodesByEmail } from "../../src/lib/server/db/actions/codes"
import { LoginPage } from "../pageObjects/login";

const firstName = "test";
const lastName = "loginwithcode";
const email = "emailLoginWithCode@familyplanz.com";

let uid = ""

test.beforeEach(async () => {
	uid = generateId(15)
	let user = await createUser({
		id: uid,
		firstName,
		lastName,
		email,
		emailVerified: true,
		picture: "",
		phonenumber: "",
		phonenumberVerified: false,
		roles: [],
	})

	await createAccount({
		provider: 'email',
		userId: user.id,
		providerAccountId: email
	});
})

test.afterEach(async () => {
	await deleteAccount(email)
	await deleteUser(uid)
	await deleteCodesByEmail(email)
})

test("Email Login With Code", async ({ page }) => {
	const loginPage = new LoginPage(page)
	await test.step("Navigate to the page", async () => {
		await loginPage.goto()
	})

	await test.step("Fill out form and submit", async () => {
		await loginPage.emailInput.fill(email)
		await loginPage.signupButton.click()
	})

	const signUpCode = await test.step("Check that an email was sent", async () => {
		await page.waitForTimeout(5000)
		const codes = await getCodesByEmail(email)

		expect(codes.length).toBe(1)
		const emailId = codes[0].emailId;
		expect(emailId).not.toBeNull()
		return codes[0].code
	})

	await test.step("Login with link and go to calendar page", async () => {
		await loginPage.verificationInput.fill(signUpCode)
		await loginPage.verificationCodeButton.click()

		await page.waitForURL("/calendar")
	})

	await test.step("Verify that the user was logged In", async () => {
		const cookies = await page.context().cookies()

		const authCookie = cookies.find((e) => e.name === "auth_session")
		expect(authCookie).not.toBeFalsy()
	})
})
