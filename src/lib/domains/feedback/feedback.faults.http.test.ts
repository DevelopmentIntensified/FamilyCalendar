/**
 * `POST /api/bug-report` when the write fails (F3 security review): the fault
 * that reaches the register must be the legacy fixed copy, never the driver's
 * message — a failed insert can carry SQL, a connection string or a person's
 * data, and the admin export is pasted into an agent.
 *
 * No database needed: `testCtx()`'s database refuses every access, which is a
 * stand-in for the driver failure the port has to survive. The golden file
 * stays untouched (`feedback.http.db.test.ts` pins the happy paths).
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { invoke } from '$lib/kernel/testing/invokeHandlers.server';
import { POST as postBugReport } from '../../../routes/api/bug-report/+server';

/** A users-row-shaped actor for the request; it never reaches a real table. */
const USER = {
	id: 'user-f3',
	email: 'mia@example.com',
	roles: [] as string[],
	firstName: 'Mia',
	lastName: 'Ng'
};

describe('POST /api/bug-report write failure', () => {
	it('files the legacy copy, never the driver message', async () => {
		const ctx = testCtx();

		const res = await invoke(postBugReport, {
			ctx,
			user: USER,
			path: '/api/bug-report',
			headers: { 'x-real-ip': '203.0.113.9' },
			body: { area: 'tasks', description: 'The save button does nothing' }
		});

		expect(res.status).toBe(500);
		expect(res.body).toEqual({ error: 'Could not save report. Please try again.' });
		expect(ctx.faults.reports).toEqual([
			{
				status: 500,
				message: 'Could not save report. Please try again.',
				path: '/api/bug-report',
				userId: USER.id
			}
		]);
		// The detail stays in the log; the filed report carries none of it.
		expect(ctx.log.entries).toContainEqual(
			expect.objectContaining({ level: 'error', event: 'bug_report_failed' })
		);
	});

	it('keeps an expected refusal an AppError, not a filed fault', async () => {
		const ctx = testCtx();

		const res = await invoke(postBugReport, {
			ctx,
			user: USER,
			path: '/api/bug-report',
			headers: { 'x-real-ip': '203.0.113.10' },
			body: { area: 'weather', description: 'nope' }
		});

		expect(res.status).toBe(400);
		expect(ctx.faults.reports).toEqual([]);
	});
});
