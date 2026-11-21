import { test, expect } from '@playwright/test';
import {
	createFamily,
	createNewUser,
	db,
	eq,
	families,
	familyMembers,
	getSessionCookie,
	teardownTestUser
} from '../testUtils';

const uniqueId = Date.now() + Math.floor(Math.random() * 100000);
const ownerEmail = `delivered+owner${uniqueId}@resend.dev`;
const searchUserEmail = `delivered+search${uniqueId}@resend.dev`;
let ownerId = '';
let searchUserId = '';
let familyId = '';

test.beforeEach(async () => {
	await teardownTestUser({ email: ownerEmail });
	await teardownTestUser({ email: searchUserEmail });
	if (familyId) await db.delete(families).where(eq(families.id, familyId));

	const owner = await createNewUser('Test', 'Owner', ownerEmail);
	ownerId = owner.id;

	const searchUser = await createNewUser('Search', 'User', searchUserEmail);
	searchUserId = searchUser.id;

	const family = await createFamily({ name: 'Test Family', color: '#3b82f6' });
	familyId = family.id;

	await db.insert(familyMembers).values({ userId: ownerId, familyId, role: 'admin' });
});

test.afterEach(async () => {
	await teardownTestUser({ email: ownerEmail });
	await teardownTestUser({ email: searchUserEmail });
	if (familyId) await db.delete(families).where(eq(families.id, familyId));
});

test('Member search and selection', async ({ page }) => {
	await test.step('Setup session', async () => {
		const cookie = await getSessionCookie(ownerEmail);
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
	});

	await test.step('Navigate to add member page', async () => {
		await page.goto('/family/' + familyId + '/members/add');
		await page.waitForLoadState('networkidle');
	});

	await test.step('Search for user by email', async () => {
		await page.fill('input[placeholder="Type to search..."]', searchUserEmail);
		await page.waitForTimeout(1000);
	});

	await test.step('Verify search results appear', async () => {
		await expect(page.locator(`ul >> text=${searchUserEmail}`).first()).toBeVisible({
			timeout: 10000
		});
	});

	await test.step('Select user', async () => {
		const escapedEmail = searchUserEmail.replace(/[+@.]/g, '\\$&');
		await page.getByRole('button', { name: new RegExp(escapedEmail) }).click();
	});

	await test.step('Verify user selected', async () => {
		await expect(page.locator(`text=${searchUserEmail}`).first()).toBeVisible();
		await expect(page.getByRole('button', { name: 'Add to Family' })).toBeVisible();
	});

	await test.step('Add user to family', async () => {
		await page.getByRole('button', { name: 'Add to Family' }).click();
		await page.waitForURL(/\/family\/.*/, { timeout: 10000 });
	});

	await test.step('Check for success message', async () => {
		await expect(page.getByText('Member Added!')).toBeVisible({ timeout: 5000 });
	});

	await test.step('Verify user added', async () => {
		const member = await db
			.select()
			.from(familyMembers)
			.where(eq(familyMembers.userId, searchUserId));
		expect(member.length).toBe(1);
	});
});
