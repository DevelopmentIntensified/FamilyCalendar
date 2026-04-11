import { test, expect } from '@playwright/test';
import { createAccount, deleteAccount, getAccount } from '../../src/lib/server/db/actions/accounts';
import { createUser, deleteUser, getUser } from '../../src/lib/server/db/actions/users';
import { deleteCodesByEmail, getCodesByEmail } from '../../src/lib/server/db/actions/codes';
import { db } from '../../src/lib/server/db';
import { calendars, users, events } from '../../src/lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { LoginPage } from '../pageObjects/login';
import { EventPage } from '../pageObjects/event';
import { createNewUser } from '../../src/lib/server/utils/createNewUser';
import { createEvent } from '../../src/lib/server/db/actions/events';
import { getUserCalendar } from '../../src/lib/server/db/actions/calendar';

const firstName = 'test';
const lastName = 'eventedit';
const email = 'eventedit@familyplanz.com';

let uid = '';
let eventId = '';

test.beforeEach(async () => {
	let user = await createNewUser(firstName, lastName, email);
	uid = user.id;

	const userCalendar = await getUserCalendar(uid);
	const now = new Date();
	now.setHours(now.getHours() + 2);
	const end = new Date();
	end.setHours(end.getHours() + 3);

	const created = await createEvent({
		title: 'Original Event',
		start: now.toISOString(),
		end: end.toISOString(),
		location: 'Original Location',
		description: 'Original Description',
		calendarId: userCalendar.id,
		ownerId: uid
	});
	eventId = created.id;
});

test.afterEach(async () => {
	const user = await db.select().from(users).where(eq(users.email, email));
	await db.delete(calendars).where(eq(calendars.ownerId, user[0].id));
	await deleteAccount(email);
	await deleteUser(uid);
	await deleteCodesByEmail(email);
});

test('Event Editing', async ({ page }) => {
	const loginPage = new LoginPage(page);
	const eventPage = new EventPage(page);

	await test.step('Login', async () => {
		await loginPage.goto();
		await loginPage.emailInput.fill(email);
		await loginPage.signupButton.click();
		await page.waitForTimeout(5000);
		const codes = await getCodesByEmail(email);
		const signUpCode = codes[0].code;
		await loginPage.verificationInput.fill(signUpCode);
		await loginPage.verificationCodeButton.click();
		await page.waitForURL('/calendar');
	});

	await test.step('Navigate to edit event page', async () => {
		await eventPage.gotoEditEvent(eventId);
	});

	await test.step('Update event title', async () => {
		await eventPage.titleInput.fill('Updated Event');
	});

	await test.step('Submit form', async () => {
		await page.getByRole('button', { name: 'Save Changes' }).click();
	});

	await test.step('Verify redirect to calendar', async () => {
		await page.waitForURL('/calendar');
	});

	await test.step('Verify updated title shows', async () => {
		await expect(page.getByText('Updated Event')).toBeVisible();
	});
});