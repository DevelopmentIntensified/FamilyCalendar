import test from "@playwright/test";

test("Email Sign Up With Code", async ({ page }) => {
	test.setTimeout(5000)
	await page.goto("/calendar")
	await page.waitForURL("/login")
})
