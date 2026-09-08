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
const lastName = 'pdf';
const email = 'pdfreal' + Date.now() + '@familyplanz.com';

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

// Real image-only PDF fixture (user-supplied). Exercises the auto-OCR
// fallback end-to-end: pdf.js text extraction → empty → page render →
// on-device OCR chain → parse → prefill or manual-fill message. Never
// the "This PDF looks like a scan" dead end.
test('PDF import: image-only receipt auto-routes through OCR, no dead end', async ({ page }) => {
	test.setTimeout(120_000);
	await login(page);
	await page.goto('/calendar/bills');

	const pdfInput = page.getByLabel('Pick a receipt PDF to import');
	await pdfInput.setInputFiles('e2e/test-data/testrecipt.pdf');

	// The scan-dead-end message must never appear.
	await expect(page.getByText('This PDF looks like a scan')).toHaveCount(0, { timeout: 10_000 });

	// Terminal state: the form got prefilled OR OCR admitted defeat honestly.
	// (Real-receipt OCR quality varies; the no-dead-end contract is the point.)
	const titleInput = page.getByLabel(/title/i).first();
	await expect
		.poll(
			async () => {
				const prefilled = (await titleInput.inputValue().catch(() => '')) !== '';
				const unreadable = await page
					.getByText(/couldn't read this clearly/i)
					.isVisible()
					.catch(() => false);
				return prefilled || unreadable;
			},
			{ timeout: 60_000, intervals: [1_000, 2_000, 5_000] }
		)
		.toBe(true);
});
