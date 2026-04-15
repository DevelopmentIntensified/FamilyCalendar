import { test, expect } from '@playwright/test';
import { db } from '$lib/server/db';
import { families, familyMembers, users, calendars } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { getSessionCookie } from '../testUtils';
import { createFamily, removeFamilyMember } from '$lib/server/db/actions/families';
import { deleteAccount } from '$lib/server/db/actions/accounts';
import { deleteUser } from '$lib/server/db/actions/users';
import { deleteCodesByEmail } from '$lib/server/db/actions/codes';

const ownerEmail = 'delivered+owner' + Date.now() + '@resend.dev';
const memberEmail = 'delivered+member' + Date.now() + '@resend.dev';
let ownerId = '';
let memberId = '';
let familyId = '';

test.beforeEach(async () => {
	await cleanupOwner();
	await cleanupMember();
	
	const ownerUser = await import('$lib/server/utils/createNewUser').then(m => m.createNewUser('Test', 'Owner', ownerEmail));
	ownerId = ownerUser.id;
	
	const memberUser = await import('$lib/server/utils/createNewUser').then(m => m.createNewUser('Test', 'Member', memberEmail));
	memberId = memberUser.id;
	
	const family = await createFamily({ name: 'Test Family', color: '#3b82f6' });
	familyId = family.id;
	
	await db.insert(familyMembers).values([
		{ userId: ownerId, familyId, role: 'admin' },
		{ userId: memberId, familyId, role: 'member' }
	]);
});

test.afterEach(async () => {
	await cleanupOwner();
	await cleanupMember();
});

async function cleanupOwner() {
	const owner = await db.select().from(users).where(eq(users.email, ownerEmail));
	if (owner[0]) {
		await db.delete(familyMembers).where(eq(familyMembers.userId, owner[0].id));
		await db.delete(calendars).where(eq(calendars.ownerId, owner[0].id));
		await deleteCodesByEmail(ownerEmail);
		await deleteAccount(ownerEmail);
		await deleteUser(owner[0].id);
	}
	if (familyId) {
		await db.delete(families).where(eq(families.id, familyId));
	}
}

async function cleanupMember() {
	const member = await db.select().from(users).where(eq(users.email, memberEmail));
	if (member[0]) {
		await db.delete(familyMembers).where(eq(familyMembers.userId, member[0].id));
		await db.delete(calendars).where(eq(calendars.ownerId, member[0].id));
		await deleteCodesByEmail(memberEmail);
		await deleteAccount(memberEmail);
		await deleteUser(member[0].id);
	}
}

test('Family member removal via UI', async ({ page }) => {
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

	await test.step('Navigate to family page', async () => {
		await page.goto('/family/' + familyId);
		await page.waitForLoadState('networkidle');
	});

	await test.step('Wait for page to load', async () => {
		await page.waitForSelector('h2:has-text("Family Members")', { timeout: 10000 });
	});

	await test.step('Click remove button', async () => {
		const removeButton = page.locator('button:has-text("Remove")').first();
		await expect(removeButton).toBeVisible({ timeout: 5000 });
		await removeButton.click();
	});

	await test.step('Confirm removal', async () => {
		await page.waitForSelector('button:has-text("Yes")', { timeout: 5000 });
		await page.click('button:has-text("Yes")');
		await page.waitForTimeout(2000);
	});

	await test.step('Verify member removed from DB', async () => {
		const remaining = await db.select().from(familyMembers).where(eq(familyMembers.userId, memberId));
		expect(remaining.length).toBe(0);
	});
});

test('Family member removal via direct DB action', async ({ page }) => {
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

	await test.step('Verify member exists before removal', async () => {
		const before = await db.select().from(familyMembers).where(eq(familyMembers.userId, memberId));
		expect(before.length).toBe(1);
	});

	await test.step('Remove member directly', async () => {
		await removeFamilyMember(familyId, memberId);
	});

	await test.step('Verify member removed from DB', async () => {
		const after = await db.select().from(familyMembers).where(eq(familyMembers.userId, memberId));
		expect(after.length).toBe(0);
	});

	await test.step('Navigate to family page to verify UI updated', async () => {
		await page.goto('/family/' + familyId);
		await page.waitForLoadState('networkidle');
		await page.waitForSelector('h2:has-text("Family Members")', { timeout: 10000 });
		const memberCount = await page.locator('text=Test Member').count();
		expect(memberCount).toBe(0);
	});
});