import type { Locator, Page } from '@playwright/test';

export class EventPage {
	page: Page;
	titleInput: Locator;
	startInput: Locator;
	endInput: Locator;
	locationInput: Locator;
	descriptionInput: Locator;
	calendarSelect: Locator;
	submitButton: Locator;
	backButton: Locator;
	deleteButton: Locator;
	confirmDeleteButton: Locator;
	editLink: Locator;

	constructor(page: Page) {
		this.page = page;
		this.titleInput = this.page.getByLabel('Title');
		this.startInput = this.page.getByLabel('Start Date and Time');
		this.endInput = this.page.getByLabel('End Date and Time');
		this.locationInput = this.page.getByLabel('Location');
		this.descriptionInput = this.page.getByLabel('description');
		this.calendarSelect = this.page.getByLabel('Calendar');
		this.submitButton = this.page.getByRole('button', { name: 'Create Event' });
		this.backButton = this.page.getByRole('button', { name: 'Back to Calendar' });
		this.deleteButton = this.page.getByRole('button', { name: 'Delete Event' });
		this.confirmDeleteButton = this.page.getByRole('button', { name: 'Confirm' });
		this.editLink = this.page.getByRole('link', { name: 'Edit Event' });
	}

	async gotoNewEvent() {
		await this.page.goto('/calendar/event/new');
	}

	async gotoEditEvent(eventId: string) {
		await this.page.goto(`/calendar/event/edit/${eventId}`);
	}

	async gotoEvent(eventId: string) {
		await this.page.goto(`/calendar/event/${eventId}`);
	}

	async fillForm(params: {
		title: string;
		start: string;
		end: string;
		location: string;
		description: string;
	}) {
		await this.titleInput.fill(params.title);
		await this.startInput.fill(params.start);
		await this.endInput.fill(params.end);
		await this.locationInput.fill(params.location);
		await this.descriptionInput.fill(params.description);
	}

	async submitCreate() {
		await this.submitButton.click();
	}
}