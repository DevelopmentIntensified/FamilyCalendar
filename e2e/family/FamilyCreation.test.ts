import { test, expect, type Page } from '@playwright/test';
import { deleteCodesByEmail } from '../../src/lib/server/db/actions/codes';
import { db } from '../../src/lib/server/db';
import {
	calendars,
	users,
	sessions,
	userSettings,
	events,
	families,
	familyMembers,
	accounts,
	userGroups,
	subscriptions,
	codes
} from '../../src/lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { createNewUser } from '../../src/lib/server/utils/createNewUser';
import { lucia } from '$lib/server/auth';

const firstName = 'test';
const lastName = 'createfamily';
const email = `delivered+createfamily${Date.now()}@resend.dev`;
const familyName = 'The Smiths';

// The second person in the family. A family created with nobody in it is a
// shell (issue 076), so the create page can pick somebody who already has an
// account — and `createNewUser` marks the address verified, which is what the
// picker searches and what the create action requires.
const memberFirstName = 'Nana';
const memberLastName = 'Ray';
const memberEmail = `delivered+nanaray${Date.now()}@resend.dev`;

let uid = '';
let memberUid = '';

async function loginWithSession(page: Page, userId: string) {
	const session = await lucia.createSession(userId, {});
	const cookie = lucia.createSessionCookie(session.id);
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

test.beforeEach(async () => {
	await cleanupExistingUser();
	const user = await createNewUser(firstName, lastName, email);
	uid = user.id;
	await db.delete(codes).where(eq(codes.email, email));
	// The person the create page will pick, seeded the same way — a real,
	// verified account, because that is what the picker searches.
	const member = await createNewUser(memberFirstName, memberLastName, memberEmail);
	memberUid = member.id;
	await db.delete(codes).where(eq(codes.email, memberEmail));
});

test.afterEach(async () => {
	const user = await db.select().from(users).where(eq(users.email, email));
	if (user[0]) {
		await cleanupUserData(user[0].id);
		await db.delete(users).where(eq(users.id, user[0].id));
		await deleteCodesByEmail(email);
	}
	const member = await db.select().from(users).where(eq(users.email, memberEmail));
	if (member[0]) {
		await cleanupUserData(member[0].id);
		await db.delete(users).where(eq(users.id, member[0].id));
		await deleteCodesByEmail(memberEmail);
	}
});

async function cleanupExistingUser() {
	const existingUser = await db.select().from(users).where(eq(users.email, email));
	if (existingUser[0]) {
		await cleanupUserData(existingUser[0].id);
		await db.delete(users).where(eq(users.id, existingUser[0].id));
		await deleteCodesByEmail(email);
	}
	const existingMember = await db.select().from(users).where(eq(users.email, memberEmail));
	if (existingMember[0]) {
		await cleanupUserData(existingMember[0].id);
		await db.delete(users).where(eq(users.id, existingMember[0].id));
		await deleteCodesByEmail(memberEmail);
	}
}

async function cleanupUserData(userId: string) {
	await db.delete(events).where(eq(events.ownerId, userId));
	await db.delete(calendars).where(eq(calendars.ownerId, userId));
	await db.delete(userSettings).where(eq(userSettings.userId, userId));
	await db.delete(sessions).where(eq(sessions.userId, userId));
	await db.delete(familyMembers).where(eq(familyMembers.userId, userId));
	await db.delete(userGroups).where(eq(userGroups.userId, userId));
	await db.delete(subscriptions).where(eq(subscriptions.userId, userId));
	await db.delete(accounts).where(eq(accounts.userId, userId));
}

test('Create family page loads', async ({ page }) => {
	await loginWithSession(page, uid);
	await page.goto('/family/create');
	await page.waitForLoadState('networkidle');

	await expect(page.getByRole('heading', { name: 'Create a Family' })).toBeVisible();
	await expect(page.getByLabel('What do you call it?')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Create Family' })).toBeVisible();
});

test('Create family page previews the family and counts the plan usage', async ({ page }) => {
	await loginWithSession(page, uid);
	await page.goto('/family/create');
	await page.waitForLoadState('networkidle');

	// The preview reads the live name field, not a hard-coded string.
	await expect(page.getByText('Your family')).toBeVisible();
	await page.getByLabel('What do you call it?').fill(familyName);
	await expect(page.getByText(familyName)).toBeVisible();

	// The usage line: 0 of 1 families used, so the upgrade banner is not the only signal.
	await expect(page.getByText('0 of 1 family used on your plan.')).toBeVisible();

	// The colour is offered as the curated earthy set and explained, not just offered.
	await expect(page.getByRole('group', { name: 'Family colour' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Terracotta' })).toBeVisible();
	await expect(page.getByText(/tints the family calendar/)).toBeVisible();
});

test('Create family form validation', async ({ page }) => {
	await loginWithSession(page, uid);
	await page.goto('/family/create');
	await page.waitForLoadState('networkidle');

	await page.getByRole('button', { name: 'Create Family' }).click();
	await expect(page.locator('.bg-red-50.rounded-lg')).toBeVisible();
});

test('Create family with name only', async ({ page }) => {
	await loginWithSession(page, uid);
	await page.goto('/family/create');
	await page.waitForLoadState('networkidle');

	await page.getByLabel('What do you call it?').fill(familyName);
	await page.getByRole('button', { name: 'Create Family' }).click();

	await page.waitForURL(/\/family\/[a-z0-9]+/, { timeout: 10000 });
	await page.waitForSelector(`text=${familyName}`, { timeout: 10000 });
	await expect(page.getByRole('heading', { name: familyName })).toBeVisible();
	// The create confirms itself: a toast naming the family it made.
	await expect(page.getByRole('status').filter({ hasText: `${familyName} created` })).toBeVisible();
});

test('Create family with the default color', async ({ page }) => {
	await loginWithSession(page, uid);
	await page.goto('/family/create');
	await page.waitForLoadState('networkidle');

	await page.getByLabel('What do you call it?').fill(familyName);
	await page.getByRole('button', { name: 'Create Family' }).click();

	await page.waitForURL(/\/family\/[a-z0-9]+/, { timeout: 10000 });
	await page.waitForSelector(`text=${familyName}`, { timeout: 10000 });
	await expect(page.getByRole('heading', { name: familyName })).toBeVisible();

	const familyId = page.url().split('/family/')[1];
	const family = await db.select().from(families).where(eq(families.id, familyId));
	expect(family[0].color).toBe('#c45e38');
});

test('Create family with custom color', async ({ page }) => {
	await loginWithSession(page, uid);
	await page.goto('/family/create');
	await page.waitForLoadState('networkidle');

	await page.getByLabel('What do you call it?').fill(familyName);
	await page.getByRole('button', { name: 'Sage' }).click();
	await page.getByRole('button', { name: 'Create Family' }).click();

	await page.waitForURL(/\/family\/[a-z0-9]+/, { timeout: 10000 });
	await page.waitForSelector(`text=${familyName}`, { timeout: 10000 });
	await expect(page.getByRole('heading', { name: familyName })).toBeVisible();

	const familyId = page.url().split('/family/')[1];
	const family = await db.select().from(families).where(eq(families.id, familyId));
	expect(family[0].color).toBe('#4d9c85');
});

test('Create family with members picked before the finish line', async ({ page }) => {
	await loginWithSession(page, uid);
	await page.goto('/family/create');
	await page.waitForLoadState('networkidle');

	// "Who is in it": the picker searches verified accounts, and it is inside
	// the create form, so a pick posts with the create. Searching by this run's
	// unique address rather than by name keeps the result unambiguous even when
	// an earlier run left a "Nana Ray" behind.
	await page.getByLabel('Search by name or email').fill(memberEmail);
	await page.getByRole('button', { name: `Add ${memberFirstName} ${memberLastName}` }).click();
	await expect(page.getByText('2 of 6 members')).toBeVisible();

	await page.getByLabel('What do you call it?').fill(familyName);
	await page.getByRole('button', { name: 'Create Family' }).click();

	await page.waitForURL(/\/family\/[a-z0-9]+/, { timeout: 10000 });

	// The family is not a shell: the picked person is a member of it.
	await expect(page.getByText('2 members')).toBeVisible();
	await expect(page.getByText(`${memberFirstName} ${memberLastName}`)).toBeVisible();

	const familyId = page.url().split('/family/')[1];
	const memberships = await db
		.select()
		.from(familyMembers)
		.where(eq(familyMembers.familyId, familyId));
	expect(memberships.map((m) => m.userId).sort()).toEqual([uid, memberUid].sort());
	// role is the permission; the creator keeps it and the picked person is a
	// plain member (CONTEXT.md, ADR-0001).
	expect(memberships.find((m) => m.userId === uid)?.role).toBe('creator');
	expect(memberships.find((m) => m.userId === memberUid)?.role).toBe('member');
});

test('Cancel returns to family list', async ({ page }) => {
	await loginWithSession(page, uid);
	await page.goto('/family/create');
	await page.waitForLoadState('networkidle');

	await page.getByRole('link', { name: 'Cancel' }).click();
	await expect(page).toHaveURL('/family');
});
