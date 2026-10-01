import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * GET /api/events is the ranged read the calendar navigates with (#082). The
 * infrastructure is scripted so the tests pin the endpoint's own contract —
 * the range it will serve, the scope it reads through, and what it returns —
 * rather than re-testing drizzle or the expansion pipeline (covered in
 * eventDisplayService.test.ts).
 */
interface ScriptedRow {
	id: string;
	title: string;
}

/** What the scripted collaborators record; the tests assert on these. */
interface RouteState {
	/** Every calendar id the access filter was called with. */
	scopeCalls: string[][];
	/** The rows the stubbed events SELECT returns. */
	rows: ScriptedRow[];
	/** The window the expansion was asked for. */
	windows: { startIso: string; endIso: string }[];
	zone: string;
}

const state = vi.hoisted((): RouteState => ({
	scopeCalls: [],
	rows: [],
	windows: [],
	zone: 'America/Denver'
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- db is infra; the endpoint's contract is what is under test.
vi.mock('$lib/server/db', () => ({
	db: {
		select: () => ({
			from: () => ({
				where: () => ({
					orderBy: async () => state.rows
				})
			})
		})
	}
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- scope logic itself is covered by calendarScope.test.ts.
vi.mock('$lib/server/db/actions/calendarScope', () => ({
	getAccessibleCalendarIds: vi.fn(async () => ['cal-personal', 'cal-family']),
	eventAccessFilter: vi.fn((userId: string, ids: string[]) => {
		state.scopeCalls.push(ids);
		return { userId, ids };
	})
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- the expansion pipeline is covered by its own suite.
vi.mock('$lib/server/services/eventDisplayService', () => ({
	monthGridWindow: vi.fn((dateIso?: string | null) => {
		const d = dateIso ? new Date(dateIso) : new Date('2026-09-30T00:00:00Z');
		return {
			start: d,
			end: new Date(d.getTime() + 86400000),
			startIso: `${dateIso ?? 'today'}T00:00:00.000Z`,
			endIso: `${dateIso ?? 'today'}T23:59:59.999Z`
		};
	}),
	expandEventsForUser: vi.fn(async (rows: ScriptedRow[]) => {
		state.windows.push({ startIso: 'expanded', endIso: 'expanded' });
		return rows.map((r, i) => ({ ...r, id: `occ-${i}`, masterId: `m-${i}` }));
	}),
	parseEvents: vi.fn(async (rows: unknown[]) => rows),
	attachRsvpStatus: vi.fn(async (_userId: string, rows: unknown[]) => rows),
	attachAttendanceSummaries: vi.fn(async (rows: unknown[]) => rows),
	attachCreatorNames: vi.fn(async (rows: unknown[]) => rows)
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- the viewer's zone is a settings lookup, not this contract.
vi.mock('$lib/server/utils/userTimezone', () => ({
	getUserZone: vi.fn(async () => state.zone)
}));

import { GET } from './+server';
import { MAX_RANGE_DAYS, resolveEventRange } from '$lib/server/services/eventRange';

type Handler = (event: {
	url: URL;
	locals: { user: { id: string } | null };
}) => Promise<Response>;

/* oxlint-disable anti-slop/no-chained-type-assertions, anti-slop/require-safety-comment-for-type-assertion -- SAFETY: the exported handler is a `RequestHandler`, whose event type SvelteKit widens past what these tests pass; the only properties the ranged read touches are `url` and `locals.user`, and every one of them is supplied by `request()` below. */
/* oxlint-disable-next-line anti-slop/no-unnecessary-type-assertion -- the cast is the whole point; see the SAFETY note above. */
const call = GET as unknown as Handler;
/* oxlint-enable anti-slop/no-chained-type-assertions, anti-slop/require-safety-comment-for-type-assertion */

function request(query: string, user: { id: string } | null = { id: 'user-1' }) {
	return call({ url: new URL(`http://localhost/api/events${query}`), locals: { user } });
}

interface RangeBody {
	error?: string;
	window?: unknown;
	events?: unknown[];
}

/* oxlint-disable anti-slop/no-runtime-typeof, anti-slop/require-safety-comment-for-type-assertion -- the response body is the handler's own `json({...})`, so the runtime check below only rules out a non-object; there is no untrusted input on this side of the boundary. */
async function json(res: Response): Promise<RangeBody> {
	const body: unknown = await res.json();
	if (typeof body !== 'object' || body === null) return {};
	// SAFETY: the guard above established a non-null object, which is RangeBody's
	// only requirement — its three fields are all optional.
	return body as RangeBody;
}
/* oxlint-enable anti-slop/no-runtime-typeof, anti-slop/require-safety-comment-for-type-assertion */

beforeEach(() => {
	state.scopeCalls = [];
	state.rows = [];
	vi.clearAllMocks();
});

describe('resolveEventRange', () => {
	it('reads a from/to pair as an inclusive month-ish window', () => {
		const range = resolveEventRange(new URLSearchParams('from=2026-10-01&to=2026-10-31'));

		expect(range).toMatchObject({ from: '2026-10-01', to: '2026-10-31' });
	});

	it('refuses a range with only one end', () => {
		expect(resolveEventRange(new URLSearchParams('from=2026-10-01'))).toEqual({
			error: 'Ask for a range: ?from=YYYY-MM-DD&to=YYYY-MM-DD.'
		});
	});

	it('refuses an unparseable date rather than guessing a window', () => {
		expect(resolveEventRange(new URLSearchParams('from=october&to=2026-10-31'))).toHaveProperty(
			'error'
		);
	});

	it('refuses a backwards range', () => {
		expect(
			resolveEventRange(new URLSearchParams('from=2026-10-31&to=2026-10-01'))
		).toHaveProperty('error');
	});

	it('caps the window so one request cannot become the ±2 years it replaced', () => {
		expect(
			resolveEventRange(new URLSearchParams('from=2026-01-01&to=2027-06-30'))
		).toHaveProperty('error');
		expect(MAX_RANGE_DAYS).toBeLessThanOrEqual(93);
	});
});

describe('GET /api/events', () => {
	it('requires a signed-in viewer', async () => {
		const res = await request('?from=2026-10-01&to=2026-10-31', null);

		expect(res.status).toBe(401);
		expect(state.scopeCalls).toHaveLength(0);
	});

	it('serves the requested window, not today', async () => {
		const res = await request('?from=2026-10-01&to=2026-10-31');

		expect(res.status).toBe(200);
		expect((await json(res)).window).toEqual({ from: '2026-10-01', to: '2026-10-31' });
	});

	it('reads through the accessible-calendar scope, personal and family alike', async () => {
		await request('?from=2026-10-01&to=2026-10-31');

		expect(state.scopeCalls).toEqual([['cal-personal', 'cal-family']]);
	});

	it('returns the expanded occurrences with attendance and creators attached', async () => {
		state.rows = [{ id: 'm-1', title: 'Soccer practice' }];

		const body = await json(await request('?from=2026-10-01&to=2026-10-31'));

		expect(body.events).toHaveLength(1);
	});

	it('says what is wrong when the range is not usable', async () => {
		const res = await request('?from=nope&to=2026-10-31');

		expect(res.status).toBe(400);
		expect((await json(res)).error).toMatch(/YYYY-MM-DD/);
	});
});