import { test, expect } from '@playwright/test';
import { EventPage } from '../pageObjects/event';
import {
	createEvent,
	createNewUser,
	getSessionCookie,
	getUserCalendar,
	teardownTestUser
} from '../testUtils';

const firstName = 'test';
const lastName = 'eventedit';
const email = 'eventedit' + Date.now() + '@familyplanz.com';

let uid = '';
let eventId = '';

test.beforeEach(async () => {
	await teardownTestUser({ email });
	const user = await createNewUser(firstName, lastName, email);
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
	await teardownTestUser({ email });
});

test.skip('Event Editing', async ({ page }) => {
	const eventPage = new EventPage(page);

	await test.step('Setup session', async () => {
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
	});

	await test.step('Navigate to event detail', async () => {
		await page.goto('/calendar');
		await page.click(`a[href="/calendar/event/${eventId}"]`);
		await page.waitForLoadState('networkidle');
	});

	await test.step('Click edit link', async () => {
		await eventPage.editLink.click();
		await page.waitForLoadState('networkidle');
	});

	await test.step('Update event title', async () => {
		await eventPage.titleInput.fill('Updated Event');
	});

	await test.step('Submit form', async () => {
		await page.getByRole('button', { name: 'Save Changes' }).click();
		await page.waitForLoadState('networkidle');

		const errorMessage = await page
			.locator('.text-red-500, [class*="text-red"]')
			.first()
			.textContent()
			.catch(() => '');
		if (errorMessage) {
			throw new Error('Form submission failed: ' + errorMessage);
		}

		await page.waitForURL('/calendar', { timeout: 15000 });
	});

	await test.step('Verify event was updated', async () => {
		await expect(page.getByText('Updated Event')).toBeVisible();
	});
});
