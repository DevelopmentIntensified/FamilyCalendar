import { describe, it, expect, vi, beforeEach } from 'vitest';

const createBugReport = vi.hoisted(() => vi.fn(async () => ({ id: 'b1' })));

// oxlint-disable-next-line anti-slop/no-module-mocking -- the action imports the DB-backed writer directly; no DI seam exists and there is no Postgres in unit runs.
vi.mock('$lib/server/db/actions/bugReports', () => ({
	BUG_AREAS: ['calendar', 'tasks', 'account', 'payments', 'dashboard', 'other'],
	createBugReport
}));

import { actions, load } from './+page.server';

const ORIGIN = 'https://test.familyplanz.com';

function submitEvent(fields: Record<string, string>, referer = `${ORIGIN}/report-bug`) {
	const fd = new FormData();
	for (const [k, v] of Object.entries(fields)) fd.set(k, v);
	return {
		locals: { user: { id: 'u1' } },
		url: new URL(`${ORIGIN}/report-bug?/submit`),
		request: {
			formData: () => Promise.resolve(fd),
			headers: { get: (n: string) => (n === 'referer' ? referer : null) }
		}
	} as never;
}

function loadEvent(search: string, referer: string | null = null) {
	return {
		locals: { user: { id: 'u1' } },
		url: new URL(`${ORIGIN}/report-bug${search}`),
		request: { headers: { get: (n: string) => (n === 'referer' ? referer : null) } }
	} as never;
}

beforeEach(() => createBugReport.mockClear());

// Issue 257: the POST referer is always /report-bug, so every report recorded
// the form's own URL instead of the page the bug was on.
describe('/report-bug records the originating page', () => {
	it('stores the submitted `from` path, not the POST referer', async () => {
		await actions.submit(
			submitEvent({ area: 'tasks', description: 'boom', from: '/calendar/tasks' })
		);
		expect(createBugReport).toHaveBeenCalledWith(
			expect.objectContaining({ url: '/calendar/tasks' })
		);
	});

	it('ignores an off-site `from`', async () => {
		await actions.submit(
			submitEvent({ area: 'tasks', description: 'boom', from: 'https://evil.example/x' })
		);
		const arg = (createBugReport.mock.calls[0] as unknown as [{ url: string }])[0];
		expect(arg.url).not.toContain('evil');
	});

	it('load exposes ?from=', async () => {
		const out = (await load(loadEvent('?from=%2Fcalendar%2Ftasks'))) as { from: string };
		expect(out.from).toBe('/calendar/tasks');
	});

	it('load falls back to the GET referer for links without ?from=', async () => {
		const out = (await load(loadEvent('', `${ORIGIN}/account`))) as { from: string };
		expect(out.from).toBe('/account');
	});
});
