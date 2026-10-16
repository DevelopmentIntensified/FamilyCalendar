import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * GET /api/account/export (#189) — auth gate + delivery envelope. The row
 * assembly lives behind `buildUserDataExport` (its contract is pinned in
 * src/lib/server/db/actions/export.test.ts); here the builder is stubbed so
 * the tests pin only the route layer: refuses anonymous requests without
 * touching the DB, and for a signed-in user returns the document as a
 * downloadable JSON attachment.
 */

const state = vi.hoisted(() => ({ calls: [] as string[] }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- db assembly is covered in export.test.ts; the route contract is the auth gate + envelope.
vi.mock('$lib/server/db/actions/export', () => ({
	buildUserDataExport: vi.fn(async (userId: string) => {
		state.calls.push(userId);
		return {
			version: 1,
			generatedAt: '2026-10-16T00:00:00.000Z',
			account: { id: userId, email: 'a@example.com' },
			// Rows only ever connected to a second user, absent from the payload:
			// lets the tests pin "no foreign private rows" on the exact bytes.
			families: [],
			tasks: [{ id: 'task-1', userId, assignedTo: 'user-b-not-mine' }],
			otherUserPrivateRows: []
		};
	})
}));

import { GET } from './+server';

function run(locals: Record<string, unknown>) {
	return GET({ locals } as never);
}

describe('GET /api/account/export', () => {
	beforeEach(() => {
		state.calls = [];
	});

	it('refuses anonymous requests and never reads data', async () => {
		const response = await run({});
		expect(response.status).toBe(401);
		const body = await response.json();
		expect(body.error).toBe('Unauthorized');
		expect(state.calls).toEqual([]);
	});

	it("returns the requester's document as a JSON attachment", async () => {
		const response = await run({ user: { id: 'user-a', email: 'a@example.com' } });

		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toContain('application/json');
		expect(response.headers.get('Content-Disposition')).toContain('attachment');
		expect(response.headers.get('Content-Disposition')).toMatch(/export-2026-10-16\.json/);

		const text = await response.text();
		const document = JSON.parse(text) as {
			version: number;
			account: { id: string; email: string };
			families: unknown[];
			otherUserPrivateRows: unknown[];
		};
		expect(document.version).toBe(1);
		expect(document.account).toEqual({ id: 'user-a', email: 'a@example.com' });
		// No other user's private rows ride along in the payload.
		expect(document.families).toEqual([]);
		expect(document.otherUserPrivateRows).toEqual([]);
		expect(state.calls).toEqual(['user-a']);
	});
});
