import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, _pingDb } from './+server';

// oxlint-disable-next-line anti-slop/no-module-mocking -- db is infra; ping/timeout behavior under test. Pattern shared with actions/*.test.ts.
const { dbStub } = vi.hoisted(() => ({ dbStub: { execute: vi.fn() } }));
vi.mock('$lib/server/db', () => ({ db: dbStub }));

const stubExecute = dbStub.execute;
const neverSettling = () => Promise.withResolvers<void>().promise;

describe('_pingDb', () => {
	beforeEach(() => {
		stubExecute.mockReset();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('pings with a bare select 1', async () => {
		stubExecute.mockResolvedValue([{ ok: 1 }]);
		await expect(_pingDb()).resolves.toBe('up');
		expect(stubExecute).toHaveBeenCalledOnce();
	});

	it('reports down when the query rejects', async () => {
		stubExecute.mockRejectedValue(new Error('connection refused'));
		await expect(_pingDb()).resolves.toBe('down');
	});

	it('reports down when the query hangs past the 1s timeout', async () => {
		vi.useFakeTimers();
		stubExecute.mockReturnValue(neverSettling());
		const pending = _pingDb();
		vi.advanceTimersByTime(999);
		await vi.advanceTimersByTimeAsync(1);
		await expect(pending).resolves.toBe('down');
	});
});

describe('GET /api/health', () => {
	beforeEach(() => {
		stubExecute.mockReset();
	});

	it('returns 200 {ok:true, db:"up"} when the db answers', async () => {
		stubExecute.mockResolvedValue([]);
		const res = await GET();
		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({ ok: true, db: 'up' });
		expect(res.headers.get('cache-control')).toBe('no-store');
	});

	it('returns 200 {ok:false, db:"down"} — not 500, no internals — when the db is down', async () => {
		stubExecute.mockRejectedValue(new Error('ECONNREFUSED with secret detail'));
		const res = await GET();
		expect(res.status).toBe(200);
		await expect(res.clone().json()).resolves.toEqual({ ok: false, db: 'down' });
		const text = await res.text();
		expect(text).not.toContain('ECONNREFUSED');
		expect(text).not.toContain('stack');
		expect(text).not.toContain('secret');
	});
});
