import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { count, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { waitlist } from '$lib/server/db/schema';
import { closeTestPool, resetTestDb } from '$lib/server/db/testHarness';
import { clearRateLimitState } from '$lib/server/utils/rateLimit';
import { actions, type WaitlistDeps } from './+page.server';

/**
 * REAL-Postgres seam for the waitlist join action (#089): the duplicate guard,
 * consent stamping, and the confirmation-email failure path are only visible
 * against an actual insert on the actual index. The confirmation email is
 * injected+mocked (the provider seam); everything else is real.
 *
 * DB lane: vitest-setup-server.ts pins DATABASE_URL to
 * 127.0.0.1:5433/familycalendar_test; schema comes from `npm run db:push:test`.
 * State resets per test.
 */

afterAll(async () => {
	await closeTestPool();
});

type RequestResult = Record<string, unknown> | { error: string; email?: string; name?: string };

// SAFETY: SvelteKit's Actions type erases the handler's optional deps
// parameter; the real handler accepts it (tests call it through this cast).
const callJoin = actions.join as (
	event: RequestEvent,
	deps?: WaitlistDeps
) => Promise<RequestResult>;

function joinEvent(fields: Record<string, string>, ip = '198.51.100.7'): RequestEvent {
	const formData = new FormData();
	for (const [key, value] of Object.entries(fields)) formData.set(key, value);
	return {
		request: {
			formData: () => Promise.resolve(formData),
			headers: { get: (name: string) => (name === 'x-real-ip' ? ip : null) }
		}
	} as never;
}

function makeDeps() {
	const gate = vi.fn(() => true);
	const sendConfirmation = vi.fn().mockResolvedValue({ success: true });
	return { deps: { gate, sendConfirmation } as WaitlistDeps, gate, sendConfirmation };
}

type Failure = { status: number; data: { error: string; email?: string; name?: string } };

function failureOf(result: RequestResult): Failure {
	// SAFETY: fail() branches structurally carry status/data; success branches
	// return plain objects asserted via successOf.
	return result as Failure;
}

async function rowFor(email: string): Promise<Array<typeof waitlist.$inferSelect>> {
	return db.select().from(waitlist).where(eq(waitlist.email, email.toLowerCase()));
}

async function rowCount(): Promise<number> {
	const [row] = await db.select({ c: count() }).from(waitlist);
	return row.c;
}

beforeEach(async () => {
	vi.clearAllMocks();
	clearRateLimitState();
	await resetTestDb();
});

describe('waitlist join — real Postgres seam (#089)', () => {
	it('stores one row per address; a resubmit gets the already-subscribed message', async () => {
		const { deps, sendConfirmation } = makeDeps();

		const first = await callJoin(joinEvent({ name: 'Jane Doe', email: 'jane@example.com' }), deps);
		expect(first).toEqual({ success: true, email: 'jane@example.com', name: 'Jane Doe' });
		expect(sendConfirmation).toHaveBeenCalledTimes(1);

		const second = await callJoin(
			joinEvent({ name: 'Jane Again', email: 'jane@example.com' }),
			deps
		);
		expect(failureOf(second).status).toBe(400);
		expect(failureOf(second).data.error).toBe('You are already on the waitlist!');
		expect(sendConfirmation).toHaveBeenCalledTimes(1);
		expect(await rowCount()).toBe(1);
	});

	it('sees Case Differences as the same address', async () => {
		const { deps } = makeDeps();

		await callJoin(joinEvent({ name: 'Jane Doe', email: 'Jane@Example.com' }), deps);
		const dupe = await callJoin(joinEvent({ name: 'Jane Again', email: 'jane@example.com' }), deps);

		expect(failureOf(dupe).status).toBe(400);
		expect(await rowCount()).toBe(1);
	});

	it('rejects invalid email with no row and no send', async () => {
		const { deps, sendConfirmation } = makeDeps();

		const result = await callJoin(joinEvent({ name: 'Jane Doe', email: 'not-an-email' }), deps);

		const failure = failureOf(result);
		expect(failure.status).toBe(400);
		expect(failure.data.error).toBe('Please enter a valid email address');
		expect(await rowCount()).toBe(0);
		expect(sendConfirmation).not.toHaveBeenCalled();
	});

	it('refuses a rate-limited caller before touching the database or the mailer', async () => {
		const { deps, gate, sendConfirmation } = makeDeps();
		gate.mockReturnValue(false);

		const result = await callJoin(joinEvent({ name: 'Jane Doe', email: 'jane@example.com' }), deps);

		const failure = failureOf(result);
		expect(failure.status).toBe(429);
		expect(failure.data.error).toBe('Too many attempts. Try again shortly.');
		expect(await rowCount()).toBe(0);
		expect(sendConfirmation).not.toHaveBeenCalled();
	});

	it('does not stamp consent when the form collected none', async () => {
		const { deps } = makeDeps();

		await callJoin(joinEvent({ name: 'Jane Doe', email: 'jane@example.com' }), deps);

		const rows = await rowFor('jane@example.com');
		expect(rows).toHaveLength(1);
		expect(rows[0].consentedAt).toBeNull();
		expect(rows[0].optedInAt).toBeNull();
	});

	it('stamps consent only when the form collected it', async () => {
		const { deps } = makeDeps();

		await callJoin(joinEvent({ name: 'Jane Doe', email: 'jane@example.com', consent: 'on' }), deps);

		const rows = await rowFor('jane@example.com');
		expect(rows).toHaveLength(1);
		expect(rows[0].consentedAt).not.toBeNull();
		expect(rows[0].optedInAt).not.toBeNull();
	});

	it('surfaces a failed confirmation email instead of claiming success', async () => {
		const { deps, sendConfirmation } = makeDeps();
		sendConfirmation.mockResolvedValue({ success: false, error: 'provider down' });

		const result = await callJoin(joinEvent({ name: 'Jane Doe', email: 'jane@example.com' }), deps);

		const failure = failureOf(result);
		expect(failure.status).toBe(500);
		expect(failure.data.error).toContain('confirmation email failed');
		// The row itself was kept: the address is on the list even though the
		// email bounced, so a retry gets the duplicate message.
		expect(await rowCount()).toBe(1);
	});
});
