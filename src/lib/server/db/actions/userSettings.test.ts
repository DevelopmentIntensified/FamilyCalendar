import { beforeEach, describe, it, expect, vi } from 'vitest';
import { updateUserSettings } from './userSettings';
// Type-only: schema types dodge the TDZ problem during mock init.
import type { UserSettings } from '$lib/server/db/schema';

// Scripted drizzle stub: records the `.set()` patch the action writes.
const state = vi.hoisted(() => ({ patches: [] as Record<string, unknown>[] }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted drizzle stub pins the write patch; real-Postgres harness tracked in docs/issues/002.
vi.mock('$lib/server/db', () => ({
	db: {
		update: (_table: unknown) => ({
			set: (patch: Record<string, unknown>) => ({
				where: () => {
					state.patches.push(patch);
					return { returning: async () => [patch] };
				}
			})
		})
	}
}));

beforeEach(() => {
	state.patches = [];
});

describe('updateUserSettings (#168: writes only whitelisted preference fields)', () => {
	it('writes allowed preference fields, including explicit nulls', async () => {
		await updateUserSettings('user-1', {
			timeZone: 'Europe/Berlin',
			weekStart: 'monday',
			defaultCalendarId: null,
			hiddenDashboardModules: ['board']
		});

		expect(state.patches).toEqual([
			{
				timeZone: 'Europe/Berlin',
				weekStart: 'monday',
				defaultCalendarId: null,
				hiddenDashboardModules: ['board']
			}
		]);
	});

	it('silently drops row-key and system fields even if handed them', async () => {
		const handed: Partial<UserSettings> = {
			timeZone: 'UTC',
			id: 'settings-9',
			userId: 'rekeyed-victim',
			updatedAt: new Date(0)
		};

		await updateUserSettings('user-1', handed);

		expect(state.patches).toEqual([{ timeZone: 'UTC' }]);
	});
});
