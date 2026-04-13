import { test, expect } from '@playwright/test';
import { db } from '$lib/server/db';
import { families, familyMembers, users, calendars } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { getSessionCookie, loginWithSession } from '../testUtils';
import { createFamily } from '$lib/server/db/actions/families';
import { deleteAccount } from '$lib/server/db/actions/accounts';
import { deleteUser } from '$lib/server/db/actions/users';
import { deleteCodesByEmail } from '$lib/server/db/actions/codes';

const ownerEmail = 'delivered+owner' + Date.now() + '@resend.dev';
const memberEmail = 'delivered+member' + Date.now() + '@resend.dev';
let ownerId = '';
let memberId = '';
let familyId = '';

test.beforeEach(async () => {
	const owner = await db.select().from(users).where(eq(users.email, ownerEmail));
	if (owner[0]) {
		await db.delete(familyMembers).where(eq(familyMembers.userId, owner[0].id));
		await db.delete(calendars).where(eq(calendars.ownerId, owner[0].id));
		await db.delete(families).where(eq(families.id, familyId));
		await deleteCodesByEmail(ownerEmail);
		await deleteUser(owner[0].id);
	}
	
	const member = await db.select().from(users).where(eq(users.email, memberEmail));
	if (member[0]) {
		await db.delete(familyMembers).where(eq(familyMembers.userId, member[0].id));
		await db.delete(calendars).where(eq(calendars.ownerId, member[0].id));
		await deleteCodesByEmail(memberEmail);
		await deleteUser(member[0].id);
	}
	
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
	const owner = await db.select().from(users).where(eq(users.email, ownerEmail));
	if (owner[0]) {
		await db.delete(familyMembers).where(eq(familyMembers.userId, owner[0].id));
		await db.delete(calendars).where(eq(calendars.ownerId, owner[0].id));
		await db.delete(families).where(eq(families.id, familyId));
		await deleteCodesByEmail(ownerEmail);
		await deleteUser(owner[0].id);
		await deleteAccount(ownerEmail);
	}
	
	const member = await db.select().from(users).where(eq(users.email, memberEmail));
	if (member[0]) {
		await db.delete(familyMembers).where(eq(familyMembers.userId, member[0].id));
		await db.delete(calendars).where(eq(calendars.ownerId, member[0].id));
		await deleteCodesByEmail(memberEmail);
		await deleteUser(member[0].id);
		await deleteAccount(memberEmail);
	}
});

test('Family member removal', async ({ page }) => {
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

	await test.step('Click remove button', async () => {
		await page.click('button:has-text("Remove")');
	});

	await test.step('Confirm removal', async () => {
		await page.click('button:has-text("Yes")');
		await page.waitForURL(/\/family\//, { timeout: 10000 });
	});

	await test.step('Verify member removed', async () => {
		const remaining = await db.select().from(familyMembers).where(eq(familyMembers.userId, memberId));
		expect(remaining.length).toBe(0);
	});
});