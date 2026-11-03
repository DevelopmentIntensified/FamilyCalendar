import { describe, it, expect, vi, beforeEach } from 'vitest';

/** GET /api/print (#292 G18): the print page's month grid as JSON, parity pinned. */
// oxlint-disable-next-line anti-slop/no-module-mocking -- DB seam: an empty calendar.
vi.mock('$lib/server/db', () => {
	const n: Record<string, unknown> = {};
	Object.assign(n, {
		from: () => n,
		where: () => Object.assign(Promise.resolve([]), { orderBy: () => Promise.resolve([]) })
	});
	return { db: { select: () => n } };
});
// oxlint-disable-next-line anti-slop/no-module-mocking -- DB-backed settings.
vi.mock('$lib/server/db/actions/userSettings', () => ({
	getUserSettings: vi.fn(async () => ({ timeZone: 'UTC', weekStart: 'monday' }))
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- DB-backed reads.
vi.mock('$lib/server/db/actions/families', () => ({ getUserFamilyId: vi.fn(async () => null) }));
// oxlint-disable-next-line anti-slop/no-module-mocking -- insert-or-read of the personal calendar.
vi.mock('$lib/server/db/actions/calendar', () => ({
	ensurePersonalCalendar: vi.fn(async () => ({ id: 'cal-me' }))
}));

import { GET } from './+server';
import { load } from '../../(calendar)/calendar/print/+page.server';

function ev(user: { id: string } | null, qs = '') {
	// SAFETY: test double — handlers read locals.user and url.
	return { locals: { user }, url: new URL(`http://x/api/print${qs}`) } as never;
}

beforeEach(() => vi.clearAllMocks());

describe('GET /api/print (G18)', () => {
	it('401 without auth', async () => {
		expect((await GET(ev(null))).status).toBe(401);
	});

	it('the requested month as a Monday-first grid', async () => {
		const body = await (await GET(ev({ id: 'u1' }, '?year=2026&month=2'))).json();
		expect(body).toMatchObject({
			year: 2026,
			month: 2,
			monthName: 'February',
			weekStart: 'monday',
			prev: { year: 2026, month: 1 },
			next: { year: 2026, month: 3 }
		});
		// Feb 1 2026 is a Sunday → six leading cells in a Monday-first week.
		expect(body.grid[6]).toMatchObject({ day: 1, iso: '2026-02-01', inMonth: true });
		expect(body.grid.length % 7).toBe(0);
	});

	it('parity with the page loader', async () => {
		const api = await (await GET(ev({ id: 'u1' }, '?year=2026&month=13'))).json();
		const page = await load(ev({ id: 'u1' }, '?year=2026&month=13'));
		expect(api).toEqual(JSON.parse(JSON.stringify(page)));
		expect(api.month).toBe(12);
	});
});
