/**
 * The mobile handlers' fault boundary: when a service throws something that is
 * not an `AppError`, the endpoint answers JSON 500 `Something went wrong — try
 * again` — never an HTML error page, and never a leaked message (legacy
 * `mobileAuth.ts:365-372`).
 *
 * The throw here is real, not mocked: the ctx's id port refuses, which is a
 * dependency no mobile flow can work without and one no service catches.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { goldenCtx } from '$lib/app/testing/goldenCtx.server';
import type { Ids } from '$lib/kernel/ids/ids';
import { invoke } from '$lib/kernel/testing/invokeHandlers.server';
import { testDb } from '$lib/kernel/testing/testDb.server';
import { mobileEmailEndpoint } from './access.http.server';

const failingIds: Ids = {
	id: () => {
		throw new Error('id port down');
	},
	random: () => {
		throw new Error('id port down');
	}
};

describe('an unexpected throw inside a mobile handler', () => {
	it('answers the JSON 500 copy instead of an HTML error page', async () => {
		const ctx = { ...goldenCtx({ db: testDb() }), ids: failingIds };
		const res = await invoke(mobileEmailEndpoint.handler, {
			ctx,
			method: 'POST',
			path: '/api/mobile/auth/email',
			body: {
				email: `fault-${Date.now()}@example.com`,
				intent: 'signup',
				firstName: 'Fault',
				lastName: 'Case'
			}
		});
		expect(res.status).toBe(500);
		expect(res.body).toEqual({ error: 'Something went wrong — try again' });
	});
});
