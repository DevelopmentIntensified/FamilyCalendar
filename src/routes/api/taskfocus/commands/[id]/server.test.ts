import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Command ack (021) at the route seam: DELETE is idempotent — a live id,
 * an unknown id, and another user's id all return 204, never 404-only.
 * Drizzle builder scripted (house stub style); route logic real.
 */
const state = vi.hoisted(() => ({
	deletedWheres: [] as unknown[]
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted drizzle stub pins the ack's scoped where; real-Postgres harness tracked in docs/issues/002.
vi.mock('$lib/server/db', () => ({
	db: {
		delete: () => ({
			where: (where: unknown) => {
				state.deletedWheres.push(where);
				return Promise.resolve();
			}
		})
	}
}));

import { DELETE } from './+server';

function event(id: string | undefined, userId: string | null) {
	return {
		params: { id },
		locals: { user: userId ? { id: userId } : null }
	} as never;
}

beforeEach(() => {
	state.deletedWheres = [];
});

describe('DELETE /api/taskfocus/commands/[id]', () => {
	it('acks a live command with 204', async () => {
		const res = await DELETE(event('c1', 'u1'));
		expect(res.status).toBe(204);
		expect(state.deletedWheres).toHaveLength(1);
	});

	it('is idempotent: an unknown id also returns 204, never 404', async () => {
		const res = await DELETE(event('already-gone', 'u1'));
		expect(res.status).toBe(204);
	});

	it('acks with no id the same way (no params row)', async () => {
		const res = await DELETE(event(undefined, 'u1'));
		expect(res.status).toBe(204);
	});

	it('rejects without a session or token', async () => {
		const res = await DELETE(event('c1', null));
		expect(res.status).toBe(401);
	});
});
