import { test, expect } from '@playwright/test';
import { db } from '$lib/server/db';
import { families, familyMembers, users, calendars, sessions } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { getSessionCookie } from '../testUtils';
import { createFamily } from '$lib/server/db/actions/families';
import { deleteAccount } from '$lib/server/db/actions/accounts';
import { deleteUser } from '$lib/server/db/actions/users';
import { deleteCodesByEmail } from '$lib/server/db/actions/codes';

const uniqueId = Date.now() + Math.floor(Math.random() * 100000);
const ownerEmail = `delivered+owner${uniqueId}@resend.dev`;
const searchUserEmail = `delivered+search${uniqueId}@resend.dev`;
let ownerId = '';
let searchUserId = '';
let familyId = '';

test.beforeEach(async () => {
	await db.delete(sessions).where(eq(sessions.userId, ownerId)).catch(() => {});
	await db.delete(sessions).where(eq(sessions.userId, searchUserId)).catch(() => {});

	const existingOwner = await db.select().from(users).where(eq(users.email, ownerEmail));
	if (existingOwner[0]) {
		await db.delete(familyMembers).where(eq(familyMembers.userId, existingOwner[0].id));
		await db.delete(calendars).where(eq(calendars.ownerId, existingOwner[0].id));
		await db.delete(families).where(eq(families.id, familyId));
		await db.delete(sessions).where(eq(sessions.userId, existingOwner[0].id));
		await deleteCodesByEmail(ownerEmail);
		await deleteUser(existingOwner[0].id);
	}

	const existingSearch = await db.select().from(users).where(eq(users.email, searchUserEmail));
	if (existingSearch[0]) {
		await db.delete(familyMembers).where(eq(familyMembers.userId, existingSearch[0].id));
		await db.delete(calendars).where(eq(calendars.ownerId, existingSearch[0].id));
		await db.delete(sessions).where(eq(sessions.userId, existingSearch[0].id));
		await deleteCodesByEmail(searchUserEmail);
		await deleteUser(existingSearch[0].id);
	}

	const owner = await import('$lib/server/utils/createNewUser').then(m => m.createNewUser('Test', 'Owner', ownerEmail));
	ownerId = owner.id;

	const searchUser = await import('$lib/server/utils/createNewUser').then(m => m.createNewUser('Search', 'User', searchUserEmail));
	searchUserId = searchUser.id;

	const family = await createFamily({ name: 'Test Family', color: '#3b82f6' });
	familyId = family.id;

	await db.insert(familyMembers).values({ userId: ownerId, familyId, role: 'admin' });
});

test.afterEach(async () => {
	const owner = await db.select().from(users).where(eq(users.email, ownerEmail));
	if (owner[0]) {
		await db.delete(familyMembers).where(eq(familyMembers.userId, owner[0].id));
		await db.delete(calendars).where(eq(calendars.ownerId, owner[0].id));
		await db.delete(families).where(eq(families.id, familyId));
		await db.delete(sessions).where(eq(sessions.userId, owner[0].id));
		await deleteCodesByEmail(ownerEmail);
		await deleteUser(owner[0].id);
		await deleteAccount(ownerEmail);
	}

	const searchUser = await db.select().from(users).where(eq(users.email, searchUserEmail));
	if (searchUser[0]) {
		await db.delete(familyMembers).where(eq(familyMembers.userId, searchUser[0].id));
		await db.delete(calendars).where(eq(calendars.ownerId, searchUser[0].id));
		await db.delete(sessions).where(eq(sessions.userId, searchUser[0].id));
		await deleteCodesByEmail(searchUserEmail);
		await deleteUser(searchUser[0].id);
		await deleteAccount(searchUserEmail);
	}
});

test('Member search and selection', async ({ page }) => {
	await test.step('Setup session', async () => {
		const cookie = await getSessionCookie(ownerEmail);
		await page.context().addCookies([{
			name: cookie.name,
			value: cookie.value,
			domain: 'localhost',
			path: '/',
			httpOnly: cookie.attributes.httpOnly,
			secure: cookie.attributes.secure,
			sameSite: 'Lax'
		}]);
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
		await expect(page.locator(`ul >> text=${searchUserEmail}`).first()).toBeVisible({ timeout: 10000 });
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
		const member = await db.select().from(familyMembers).where(eq(familyMembers.userId, searchUserId));
		expect(member.length).toBe(1);
	});
});