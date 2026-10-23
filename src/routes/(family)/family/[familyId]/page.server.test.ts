import { describe, it, expect, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { actions } from './+page.server';

vi.mock('$lib/server/db/actions/families', () => ({
	getFamilyRoster: vi.fn(),
	getFamilyInviteCodes: vi.fn(),
	getUserFamilyMemberships: vi.fn(),
	removeFamilyMember: vi.fn(),
	updateFamilies: vi.fn()
}));

vi.mock('$lib/server/db/actions/dashboardModules', () => ({
	getFamilyModuleSwitches: vi.fn(),
	setFamilyModuleSwitch: vi.fn()
}));

vi.mock('$lib/server/db/actions/familyActivity', () => ({
	getRecentFamilyActivity: vi.fn()
}));

vi.mock('$lib/server/db/actions/userSettings', () => ({
	getUserSettings: vi.fn()
}));

import { removeFamilyMember, updateFamilies } from '$lib/server/db/actions/families';
import { setFamilyModuleSwitch } from '$lib/server/db/actions/dashboardModules';

type RequestResult = Record<string, unknown> | void;

function failureOf(result: RequestResult): { status: number; data: Record<string, unknown> } {
	// SAFETY: failing branches return fail(...), which structurally carries
	// status/data (same narrowing style as other route tests).
	return result as { status: number; data: Record<string, unknown> };
}

const UNSIGNED = {
	request: { formData: () => Promise.resolve(new FormData()) },
	params: { familyId: 'fam-1' },
	locals: { user: null, session: null }
} as never;

describe('unauthenticated POSTs to family actions fail 401 (issue 153)', () => {
	const unsignedActions = [
		'removeMember',
		'updateRole',
		'setMemberType',
		'updateFamily',
		'toggleDashboardModule'
	] as const;

	it.each(unsignedActions)('%s returns fail(401) instead of throwing', async (name) => {
		const handler = actions[name] as (event: RequestEvent) => Promise<RequestResult>;

		const result = await handler(UNSIGNED);

		expect(failureOf(result).status).toBe(401);
	});

	it('unauthenticated POSTs write nothing', async () => {
		for (const name of unsignedActions) {
			const handler = actions[name] as (event: RequestEvent) => Promise<RequestResult>;
			await handler(UNSIGNED);
		}

		expect(removeFamilyMember).not.toHaveBeenCalled();
		expect(updateFamilies).not.toHaveBeenCalled();
		expect(setFamilyModuleSwitch).not.toHaveBeenCalled();
	});
});
