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
const lastName = 'bills';
const email = 'bills' + Date.now() + '@familyplanz.com';

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

test('Bills CRUD: create via API, list in UI, delete', async ({ page }) => {
	await login(page);

	const createResp = await page.request.post('/api/bills', {
		data: {
			title: 'Electric',
			amount: 120,
			dueDate: '2026-09-15',
			category: 'utilities'
		}
	});
	expect(createResp.ok()).toBe(true);

	const rows = await db.select().from(bills).where(eq(bills.userId, uid));
	expect(rows).toHaveLength(1);
	expect(rows[0].amountCents).toBe(12000);
	expect(rows[0].category).toBe('utilities');

	await page.goto('/calendar/bills');
	await page.waitForLoadState('networkidle');
	await expect(page.getByText('Electric')).toBeVisible();
	await expect(page.getByText('$120.00')).toBeVisible();

	await page.getByRole('button', { name: 'Delete bill Electric' }).click();
	await page.getByRole('button', { name: 'Confirm delete Electric' }).click();
	await expect(page.getByText('$120.00')).toHaveCount(0);
	await expect(page.getByText('No bills yet')).toBeVisible();

	const after = await db.select().from(bills).where(eq(bills.userId, uid));
	expect(after).toHaveLength(0);
});

test('Bills detail row: expand works with no receipt storage (issue 010 strip)', async ({
	page
}) => {
	await login(page);

	const createResp = await page.request.post('/api/bills', {
		data: { title: 'Water', amount: 40, dueDate: '2026-09-20', category: 'utilities' }
	});
	expect(createResp.ok()).toBe(true);

	await page.goto('/calendar/bills');
	await page.waitForLoadState('networkidle');
	await expect(page.getByText('Water')).toBeVisible();

	// Storage-free: no attach/remove affordances, no receipt images anywhere.
	await expect(page.getByRole('button', { name: 'Attach receipt photo' })).toHaveCount(0);
	await page.getByRole('button', { name: 'Show details for Water' }).click();
	await expect(page.getByRole('img', { name: /receipt/i })).toHaveCount(0);
	await expect(page.getByText(/scanned on your device and discarded/i)).toBeVisible();
	// The scan flow survives: one mobile-camera input on the create form.
	await expect(page.locator('input[accept="image/*"][capture="environment"]')).toHaveCount(1);

	await page.getByRole('button', { name: 'Hide details for Water' }).click();
	await page.getByRole('button', { name: 'Delete bill Water' }).click();
	await page.getByRole('button', { name: 'Confirm delete Water' }).click();
});
