import { test, expect, type Page } from '@playwright/test';
import { deleteAccount } from '../../src/lib/server/db/actions/accounts';
import { deleteUser } from '../../src/lib/server/db/actions/users';
import { createCode, deleteCodesByEmail } from '../../src/lib/server/db/actions/codes';
import { db } from '../../src/lib/server/db';
import { bills, users } from '../../src/lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { createNewUser } from '../../src/lib/server/utils/createNewUser';
import { getSessionCookie } from '../testUtils';

const firstName = 'test';
const lastName = 'spending';
const email = 'spending' + Date.now() + '@familyplanz.com';

let uid = '';

test.beforeEach(async () => {
	const existingUser = await db.select().from(users).where(eq(users.email, email));
	if (existingUser[0]) {
		await db.delete(bills).where(eq(bills.userId, existingUser[0].id));
		await deleteAccount(email);
		await deleteUser(existingUser[0].id);
		await deleteCodesByEmail(email);
	}
	const user = await createNewUser(firstName, lastName, email);
	uid = user.id;
	await createCode({
		code: Math.random().toString(36).substring(2, 10),
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
		await db.delete(bills).where(eq(bills.userId, user[0].id));
		await deleteAccount(email);
		await deleteUser(uid);
		await deleteCodesByEmail(email);
	}
});

async function login(page: Page) {
	const cookie = await getSessionCookie(email);
	await page.context().addCookies([
		{
			name: cookie.name,
			value: cookie.value,
			domain: 'localhost',
			path: '/',
			httpOnly: cookie.attributes.httpOnly,
			secure: cookie.attributes.secure,
			sameSite: 'Lax'
		}
	]);
}

test('Spending reports smoke: bills link, page renders, drill-down', async ({ page }) => {
	await login(page);

	// Seed two bills in different months via the API (same as the bills page uses).
	for (const bill of [
		{ title: 'Electric', amount: 120, dueDate: '2026-09-15', category: 'utilities' },
		{ title: 'Rent', amount: 900, dueDate: '2026-08-01', category: 'housing' }
	]) {
		const resp = await page.request.post('/api/bills', { data: bill });
		expect(resp.ok()).toBe(true);
	}

	// The bills page header links to Spending.
	await page.goto('/calendar/bills');
	await expect(page.getByRole('link', { name: 'Spending' })).toBeVisible();

	// Reports page renders with the seeded months as columns.
	await page.goto('/calendar/spending');
	await expect(page.getByRole('heading', { name: 'Spending' })).toBeVisible();
	await expect(page.getByText('Monthly trend by category')).toBeVisible();
	await expect(page.getByText('Where it went')).toBeVisible();
	await expect(page.getByText('$900.00')).toBeVisible();
	await expect(page.getByText('$120.00')).toBeVisible();

	// Category drill-down shows the seeded bill.
	await page.getByRole('button', { name: /Housing/ }).click();
	await expect(page.getByText('Rent')).toBeVisible();

	// Range navigation works.
	await page.goto('/calendar/spending?range=all');
	await expect(page.getByText('Monthly trend by category')).toBeVisible();
});
