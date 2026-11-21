/**
 * The banner as a pure table. Expected values are legacy `+page.svelte:24-32`.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { ACCOUNT_BANNER_FALLBACK, accountBanner } from './account.form.rules';

describe('accountBanner', () => {
	it('shows nothing without a form answer', () => {
		expect(accountBanner(null)).toBeNull();
		expect(accountBanner(undefined)).toBeNull();
	});

	it('renders one green banner when the action succeeded with a message', () => {
		expect(accountBanner({ success: true, message: 'Profile updated successfully' })).toEqual({
			kind: 'success',
			message: 'Profile updated successfully',
			guestNeedsClaim: false
		});
	});

	it('shows nothing for a success without a message', () => {
		expect(accountBanner({ success: true })).toBeNull();
	});

	it('reads message first and error second on a failure', () => {
		expect(
			accountBanner({ success: false, message: 'Selected default calendar is not available' })
		).toEqual({
			kind: 'error',
			message: 'Selected default calendar is not available',
			guestNeedsClaim: false
		});
		// A signed-out POST carries only the kernel's `error` field.
		expect(accountBanner({ success: false, error: 'Not signed in' })).toEqual({
			kind: 'error',
			message: 'Not signed in',
			guestNeedsClaim: false
		});
	});

	it('falls back to the approved sentence rather than an empty red banner', () => {
		expect(accountBanner({ success: false })).toEqual({
			kind: 'error',
			message: ACCOUNT_BANNER_FALLBACK,
			guestNeedsClaim: false
		});
		expect(ACCOUNT_BANNER_FALLBACK).toBe('Something went wrong. Please try again.');
	});

	it('carries guestNeedsClaim so the banner adds the claim link', () => {
		const banner = accountBanner({
			success: false,
			message:
				"You're using a guest calendar — add your first email from the Save-your-calendar banner instead.",
			guestNeedsClaim: true
		});
		expect(banner?.guestNeedsClaim).toBe(true);
	});
});
