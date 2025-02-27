import { NOREPLYEMAIL, RESEND_API } from "../globals";
import test from "@playwright/test";
import { deleteAccount } from "../../src/lib/server/db/actions/accounts"
import { deleteCode, deleteCodesByEmail, getCodesByEmail } from "../../src/lib/server/db/actions/codes"
import { SignUpPage } from "../pageObjects/signup";

const firstName = "test";
const lastName = "test";
const email = NOREPLYEMAIL as string;

test.afterEach(async () => {
	await deleteAccount(email)
	await deleteCodesByEmail(email)
})

test("Email Sign Up With Code", async ({ page }) => {
	const signUpPage = new SignUpPage(page)
	await page.goto("/signup")
	await signUpPage.firstNameInput.fill(firstName)
	await signUpPage.lastNameInput.fill(lastName)
	await signUpPage.emailInput.fill(email)
	await signUpPage.signupButton.click()

	await page.waitForTimeout(3000)
	const codes = await getCodesByEmail(email)
	console.log(codes)
	const code = codes[0].code;

	await signUpPage.verificationInput.fill(code)
	await signUpPage.verificationCodeButton.click()
	
	await page.waitForURL("/calendar")
})
