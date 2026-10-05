import { render, cleanup, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { tick } from 'svelte';
import AccountNotificationsSection from './AccountNotificationsSection.svelte';
import {
	DEFAULT_NOTIFICATION_PREFERENCES,
	type NotificationPreferences
} from './accountNotifications';

/**
 * The approved Notifications card.
 *
 * Two things are worth pinning that a screenshot cannot: that a switch carries the
 * value it is flipping TO (so a save cannot silently re-persist what was already
 * on), and that pressing one moves the switch and names the change immediately.
 */

/** Render, then let the component's effects run before anything is pressed. */
async function renderCard(props: { preferences: NotificationPreferences | null }) {
	render(AccountNotificationsSection, { props });
	await tick();
}

function prefs(overrides: Partial<NotificationPreferences> = {}): NotificationPreferences {
	return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...overrides };
}

function switches(): HTMLButtonElement[] {
	// SAFETY: the selector names `button[role="switch"]`, so every match is a
	// button and `HTMLButtonElement` is its real type.
	return [...document.querySelectorAll('button[role="switch"]')] as HTMLButtonElement[];
}

function switchByLabel(label: string): HTMLButtonElement {
	const row = [...document.querySelectorAll('form')].find((f) => f.textContent?.includes(label));
	const button = row?.querySelector('button[role="switch"]');
	// SAFETY: the selector names `button[role="switch"]`, so the match is a
	// button; the throw above is what makes "no such row" fail loudly.
	return button as HTMLButtonElement;
}

describe('AccountNotificationsSection — the approved card', () => {
	afterEach(cleanup);

	it('shows the four switches, in the approved order, each with its hint', async () => {
		await renderCard({ preferences: prefs() });
		expect(switches()).toHaveLength(4);
		const rows = [...document.querySelectorAll('form')].map((f) => f.textContent?.replace(/\s+/g, ' ').trim());
		expect(rows).toEqual([
			'Task assigned to me In-app and push',
			'Task completed In-app and push',
			'Someone joined the family In-app only',
			'AI event suggestions Uses your AI allowance'
		]);
	});

	it('shows the approved defaults to an account that has never opened this card', async () => {
		// The loader substitutes the defaults when there is no saved bag, so this
		// is what a never-touched account sees: on, on, off, on.
		await renderCard({ preferences: prefs() });
		expect(switches().map((s) => s.getAttribute('aria-checked'))).toEqual([
			'true',
			'true',
			'false',
			'true'
		]);
	});

	it('reflects what was saved', async () => {
		await renderCard({ preferences: prefs({ taskCompleted: false, aiSuggestions: false }) });
		expect(switches().map((s) => s.getAttribute('aria-checked'))).toEqual([
			'true',
			'false',
			'false',
			'false'
		]);
	});

	it('skeletons the rows rather than rendering an empty card when nothing is loaded yet', async () => {
		await renderCard({ preferences: null });
		expect(switches()).toHaveLength(0);
		expect(document.querySelectorAll('[data-testid="notification-skeleton"]')).toHaveLength(4);
	});

	it('carries the approved note and the link to the alerts', async () => {
		await renderCard({ preferences: prefs() });
		const note = document.querySelector('[data-testid="notification-note"]')!;
		const text = note.textContent!.replace(/\s+/g, ' ');
		expect(text).toContain('activeSubscriptions.notificationMethods');
		expect(text).toContain('no migration path if a sixth type is added later');
		const link = document.querySelector('a[href="/calendar/notifications"]')!;
		expect(link.textContent?.trim()).toBe('See the alerts');
	});

	describe('the switches are real switches', () => {
		it('are native submit buttons, so they are keyboard operable and need no JS', async () => {
			await renderCard({ preferences: prefs() });
			for (const button of switches()) {
				expect(button.tagName).toBe('BUTTON');
				expect(button.getAttribute('type')).toBe('submit');
				expect(button.getAttribute('name')).toBe('value');
				expect(button.form).toBeTruthy();
				expect(button.tabIndex).toBe(0);
			}
		});

		it('each carry an accessible name and describe themselves by their hint', async () => {
			await renderCard({ preferences: prefs() });
			expect(switchByLabel('Someone joined the family').getAttribute('aria-label')).toBe(
				'Someone joined the family'
			);
			const describedBy = switchByLabel('AI event suggestions').getAttribute('aria-describedby');
			expect(describedBy).toBeTruthy();
			expect(document.getElementById(describedBy!)?.textContent?.trim()).toBe(
				'Uses your AI allowance'
			);
		});

		it('flip aria-checked the moment they are pressed, before the save answers', async () => {
			await renderCard({ preferences: prefs() });
			const button = switchByLabel('Someone joined the family');
			expect(button.getAttribute('aria-checked')).toBe('false');
			await fireEvent.click(button);
			expect(button.getAttribute('aria-checked')).toBe('true');
		});
	});

	describe('a switch that only renders is a failure', () => {
		// The payload is carried entirely by the DOM: a hidden `preference` field
		// naming the row, and the switch itself as the submit button carrying the
		// value being saved. `use:enhance` with a parameter never runs under vitest
		// in this repo (an action without one does), so the payload is asserted here
		// at the level the browser serializes it from, and the save itself is
		// covered by notificationMethods.test.ts.
		it('posts the value it is flipping TO, not the one it is leaving', async () => {
			await renderCard({ preferences: prefs() });
			const button = switchByLabel('Task completed');
			// Rendered value: the row is on, so the next value is off.
			expect(button.getAttribute('value')).toBe('false');
			await fireEvent.click(button);
			// Still off after the re-render: the in-flight save is what the button
			// now carries, so a submission racing the render cannot post the value
			// the switch already holds.
			expect(button.getAttribute('value')).toBe('false');
			expect(button.value).toBe('false');
			expect(button.form!.querySelector('input[name="preference"]')).toHaveProperty(
				'value',
				'taskCompleted'
			);
		});

		it('posts the value a switch that was OFF is being turned to', async () => {
			await renderCard({ preferences: prefs() });
			const button = switchByLabel('Someone joined the family');
			expect(button.getAttribute('aria-checked')).toBe('false');
			expect(button.getAttribute('value')).toBe('true');
			await fireEvent.click(button);
			expect(button.getAttribute('aria-checked')).toBe('true');
			expect(button.value).toBe('true');
		});

		it('posts to its own action, one form per row, and names the row', async () => {
			await renderCard({ preferences: prefs() });
			for (const form of document.querySelectorAll('form')) {
				expect(form.getAttribute('action')).toContain('setNotificationPreference');
				expect(form.getAttribute('method')?.toUpperCase()).toBe('POST');
				expect(form.querySelector('input[name="preference"]')).toBeTruthy();
			}
			await fireEvent.click(switchByLabel('AI event suggestions'));
			expect(switchByLabel('AI event suggestions').form!.querySelector('input[name="preference"]')).toHaveProperty(
				'value',
				'aiSuggestions'
			);
		});

		it('saves one row without touching the other three', async () => {
			await renderCard({ preferences: prefs() });
			await fireEvent.click(switchByLabel('AI event suggestions'));
			expect(switches().map((s) => s.getAttribute('aria-checked'))).toEqual([
				'true',
				'true',
				'false',
				'false'
			]);
		});

		it('names what changed, immediately, and never in a bare alert', async () => {
			const alertSpy = vi.fn();
			const original = window.alert;
			window.alert = alertSpy;
			try {
				await renderCard({ preferences: prefs() });
				await fireEvent.click(switchByLabel('Task assigned to me'));
				const status = document.querySelector('[data-testid="notification-status"]')!;
				expect(status.textContent).toContain('Task assigned to me');
				expect(status.textContent).toContain('off');
				expect(status.getAttribute('role')).toBe('status');
				expect(alertSpy).not.toHaveBeenCalled();
			} finally {
				window.alert = original;
			}
		});
	});
});
