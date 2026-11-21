/**
 * The banner and the show-based module form as pure tables. Expected values are
 * legacy `+page.svelte:24-32` and `accountDashboardModules.ts:40-54`.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { DASHBOARD_MODULES } from '$lib/domains/dashboardModules';
import {
	ACCOUNT_BANNER_FALLBACK,
	accountBanner,
	accountHiddenModulesFromForm,
	accountModuleVisibility
} from './account.form.rules';

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
		expect(accountBanner({ success: false, message: 'Selected default calendar is not available' })).toEqual(
			{ kind: 'error', message: 'Selected default calendar is not available', guestNeedsClaim: false }
		);
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
			message: "You're using a guest calendar — add your first email from the Save-your-calendar banner instead.",
			guestNeedsClaim: true
		});
		expect(banner?.guestNeedsClaim).toBe(true);
	});
});

describe('accountHiddenModulesFromForm', () => {
	it('hides every module whose checkbox is absent, in registry order', () => {
		const form = new FormData();
		form.set('module_verse', 'on');
		form.set('module_meals', 'on');
		expect(accountHiddenModulesFromForm(form)).toEqual(
			DASHBOARD_MODULES.map((module) => module.id).filter(
				(id) => id !== 'verse' && id !== 'meals'
			)
		);
	});

	it('hides everything when no checkbox arrives', () => {
		expect(accountHiddenModulesFromForm(new FormData())).toEqual(
			DASHBOARD_MODULES.map((module) => module.id)
		);
	});

	it('drops a retired id a hand-made form posts', () => {
		const form = new FormData();
		for (const module of DASHBOARD_MODULES) form.set(`module_${module.id}`, 'on');
		form.set('module_retired', 'on');
		expect(accountHiddenModulesFromForm(form)).toEqual([]);
	});
});

describe('accountModuleVisibility', () => {
	it('reads a saved hidden id as off and everything else as on', () => {
		const shown = accountModuleVisibility(['glance']);
		expect(shown.glance).toBe(false);
		expect(shown.verse).toBe(true);
	});

	it('ignores a stale saved id rather than hiding everything', () => {
		const shown = accountModuleVisibility(['retired-module']);
		expect(Object.values(shown).every(Boolean)).toBe(true);
	});
});
