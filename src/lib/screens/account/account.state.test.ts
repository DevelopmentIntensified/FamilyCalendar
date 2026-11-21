/**
 * The screen's client state with a fake api and no DOM: one fetch per section
 * per visit, the failed-fetch retry, the optimistic notification flip with its
 * revert, and the export's two toasts.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { memoryToasts } from '$lib/kernel/client/toasts.svelte';
import type { ApiResult } from '$lib/kernel/client/apiClient';
import type { AlertPreferences } from '$lib/domains/alerts';
import type { AccountApi } from './account.api';
import type { AccountSectionModel } from './account.contract';
import { AccountNotificationsState, AccountScreenState } from './account.state.svelte';

const NOW = new Date('2027-03-20T12:00:00.000Z');
const PROFILE: AccountSectionModel = {
	section: 'profile',
	person: {
		id: 'user-1',
		firstName: 'Ada',
		lastName: 'Lovelace',
		email: 'ada@example.test',
		emailVerified: true,
		isAnonymous: false,
		roles: [],
		lastActiveAt: null
	}
};
const FAMILIES: AccountSectionModel = {
	section: 'families',
	families: [{ id: 'family-1', name: 'Lovelace', role: 'owner', memberType: 'parent', memberCount: 1 }]
};

/** A fake api: per-section answers, and a call log. */
function fakeApi(answers: Partial<Record<AccountSectionModel['section'], ApiResult<AccountSectionModel>>> = {}) {
	const calls: string[] = [];
	const api: AccountApi = {
		fetchSection: async (section) => {
			calls.push(section);
			return answers[section] ?? { ok: true, data: PROFILE };
		},
		downloadExport: async () => ({ ok: true, data: undefined })
	};
	return { api, calls };
}

describe('AccountScreenState', () => {
	it('fetches a section once per visit and renders it from the cache afterwards', async () => {
		const { api, calls } = fakeApi({ families: { ok: true, data: FAMILIES } });
		const state = new AccountScreenState(api, memoryToasts(), PROFILE, NOW);

		await state.select('families');
		expect(calls).toEqual(['families']);
		expect(state.model()).toEqual(FAMILIES);

		await state.select('profile');
		expect(state.model()).toEqual(PROFILE);

		await state.select('families');
		expect(calls).toEqual(['families']);
		expect(state.model()).toEqual(FAMILIES);
	});

	it('keeps the failure sentence, then retries on demand', async () => {
		let attempt = 0;
		const api: AccountApi = {
			fetchSection: async () => {
				attempt += 1;
				return attempt === 1
					? { ok: false, status: 500, error: 'Check your connection (a VPN can block it), then try again.' }
					: { ok: true, data: FAMILIES };
			},
			downloadExport: async () => ({ ok: true, data: undefined })
		};
		const state = new AccountScreenState(api, memoryToasts(), PROFILE, NOW);

		await state.select('families');
		expect(state.error).toBe('Check your connection (a VPN can block it), then try again.');
		expect(state.model()).toBeNull();

		await state.load('families');
		expect(state.error).toBeNull();
		expect(state.model()).toEqual(FAMILIES);
	});

	it('toasts the export as it starts and after it lands', async () => {
		const toasts = memoryToasts();
		const state = new AccountScreenState(fakeApi().api, toasts, PROFILE, NOW);

		await state.exportData();

		expect(toasts.items).toEqual([
			{ kind: 'info', text: 'Preparing your data export…' },
			{ kind: 'success', text: 'Data export downloaded.' }
		]);
		expect(state.exporting).toBe(false);
	});

	it('explains a failed export instead of claiming success', async () => {
		const toasts = memoryToasts();
		const api: AccountApi = {
			fetchSection: async () => ({ ok: true, data: PROFILE }),
			downloadExport: async () => ({ ok: false, status: 500, error: 'Export failed (500)' })
		};
		const state = new AccountScreenState(api, toasts, PROFILE, NOW);

		await state.exportData();

		expect(toasts.items).toEqual([
			{ kind: 'info', text: 'Preparing your data export…' },
			{ kind: 'error', text: 'Data export failed — please try again.' }
		]);
	});
});

describe('AccountNotificationsState', () => {
	const SERVER: AlertPreferences = {
		taskAssigned: true,
		taskCompleted: true,
		familyJoined: false,
		aiSuggestions: true
	};

	it('flips and names the receipt the moment the switch is pressed', () => {
		const state = new AccountNotificationsState(SERVER);

		state.press('familyJoined');

		expect(state.preferences.familyJoined).toBe(true);
		expect(state.status).toBe('Someone joined the family alerts are on.');
		expect(state.pendingId).toBe('familyJoined');
	});

	it('puts the switch back where the server still has it when the save fails', () => {
		const state = new AccountNotificationsState(SERVER);

		state.press('familyJoined');
		state.settle(false);

		expect(state.preferences.familyJoined).toBe(false);
		expect(state.statusIsError).toBe(true);
		expect(state.status).toBe('Someone joined the family didn’t save — try again.');
		expect(state.pendingId).toBeNull();
	});

	it('keeps the flip and the server value in step when the save lands', () => {
		const state = new AccountNotificationsState(SERVER);

		state.press('familyJoined');
		state.settle(true);
		expect(state.preferences.familyJoined).toBe(true);

		// The next flip is against the saved value, not the original one.
		state.press('familyJoined');
		expect(state.preferences.familyJoined).toBe(false);
	});

	it('posts the value being saved while a save is in flight', () => {
		const state = new AccountNotificationsState(SERVER);
		expect(state.nextValue('taskAssigned', true)).toBe(false);
		state.press('taskAssigned');
		// The switch now reads off, and the in-flight payload is still "off".
		expect(state.preferences.taskAssigned).toBe(false);
		expect(state.nextValue('taskAssigned', false)).toBe(false);
	});
});
