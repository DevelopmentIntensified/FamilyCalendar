import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PgTable } from 'drizzle-orm/pg-core';

/**
 * The calendar loader's guest-merge prompt (#241) and the facts it hands the
 * event modal (#282). The stubs are only the DB seam; the rules under test
 * stay real.
 */

/** A drizzle chain stub: a resolved promise carrying the builder methods. */
function makeChain(rows: unknown[] = []) {
	const chain = Object.assign(Promise.resolve(rows), {
		from: () => chain,
		where: () => chain,
		orderBy: () => chain,
		groupBy: () => chain,
		limit: () => chain,
		innerJoin: () => chain,
		leftJoin: () => chain
	});
	return chain;
}

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted drizzle stub, same shape as family/page.server.test.ts; only the loader's own reads are under test.
vi.mock('$lib/server/db', () => ({
	db: {
		// Every drizzle query opens with `.from()`; the tables this loader
		// touches script back as empty, which is a family with nothing in it.
		select: () => ({ from: (_table: PgTable) => makeChain() })
	}
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- the calendar/task reads are not what this suite is about.
vi.mock('$lib/server/db/actions/calendar', () => ({
	ensurePersonalCalendar: vi.fn(async () => null)
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- the calendar/task reads are not what this suite is about.
vi.mock('$lib/server/db/actions/tasks', () => ({
	// Issue 110: the cursor pin lives inside getTasksForUser — no separate
	// sync stub exists anymore.
	getTasksForUser: vi.fn(async () => [])
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- #241: the merge-candidate DB check is not under test, only who gets prompted.
vi.mock('$lib/server/services/guestMergeService', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/services/guestMergeService')>()),
	isClaimableGuest: vi.fn(async () => false)
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- #282: the category read is a DB seam; only that the loader hands it on is under test.
vi.mock('$lib/server/db/actions/taskCategories', () => ({
	listCategoryOptions: vi.fn(async () => [{ id: 'c1', name: 'Errands' }])
}));

import { load } from './+page.server';
import { isClaimableGuest } from '$lib/server/services/guestMergeService';

/** A persisted userSettings row, as the group layout hands it to the loader. */
type SavedSettings = {
	hiddenDashboardModules: string[] | null;
};

function settingsFor(over: Partial<SavedSettings> = {}): SavedSettings {
	return {
		hiddenDashboardModules: [],
		...over
	};
}

/** The load event, carrying the layout's already-loaded facts. */
/** A layout roster row (`getFamilyRoster`), as `parent()` hands it on. */
type RosterRow = {
	userId: string;
	firstName: string;
	lastName: string;
	email: string | null;
	role: string | null;
	memberType: string | null;
};

function loadEvent(
	settings: SavedSettings,
	familyId: string | null = 'f-rivera',
	familyMembers: RosterRow[] = []
) {
	// SAFETY: the loader reads only `locals.user`, `url.searchParams`,
	// `cookies.get` and `parent()` off the event; each is supplied above with
	// the shape it is read as, and the rest of RequestEvent is irrelevant here.
	// `locals.user` is the real `users` row now — spelled out, no cast.
	return {
		locals: {
			user: {
				id: 'u-sarah',
				firstName: 'Sarah',
				lastName: 'Rivera',
				email: 'sarah@example.com',
				passwordHash: null,
				emailVerified: null,
				picture: null,
				roles: [],
				createdAt: new Date(0),
				lastActiveAt: new Date(0),
				updatedAt: new Date(0),
				phonenumber: null,
				phonenumberVerified: null,
				lastLogin: new Date(0),
				receiptIngestToken: null
			}
		},
		url: { searchParams: new URLSearchParams() },
		cookies: { get: () => undefined, delete: () => {} },
		parent: async () => ({ userSettings: settings, familyId, familyMembers })
		// SAFETY: the loader reads four members off the event (see above); the
		// partial mock is intentionally incomplete vs RequestEvent, so the cast
		// goes through unknown by design.
	} as unknown as Parameters<typeof load>[0];
}

interface CalendarData {
	loadWarnings: string[];
	calendarData: Promise<unknown>;
}

async function runLoad(settings: SavedSettings): Promise<CalendarData> {
	// SAFETY: the fake event carries a user and no `defaultView`, so the
	// redirect arm cannot be reached and `load` returns its data bag.
	const data = (await load(loadEvent(settings))) as Exclude<
		Awaited<ReturnType<typeof load>>,
		void
	>;
	// The page streams its grid; let it settle so nothing is left in flight.
	await data.calendarData;
	// SAFETY: the fields read below are asserted, field by field, by the tests.
	return data as CalendarData;
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe('/calendar — guest-merge prompt only for registered accounts (#241)', () => {
	async function outcome(email: string) {
		vi.mocked(isClaimableGuest).mockResolvedValue(true);
		const ev = loadEvent(settingsFor());
		// SAFETY: same partial event as loadEvent; only email + the stash cookie differ.
		const e = ev as unknown as {
			locals: { user: { email: string } };
			cookies: { get: () => string | undefined };
		};
		e.locals.user.email = email;
		e.cookies.get = () => 'other-guest';
		try {
			const data = await load(ev);
			await (data as { calendarData?: Promise<unknown> } | undefined)?.calendarData;
			return 'stayed';
		} catch (err) {
			return (err as { location?: string }).location ?? 'threw';
		}
	}

	it('an Anonymous Account (placeholder email) with a stale stash cookie is not sent to /merge-guest', async () => {
		expect(await outcome('u-sarah@anonymous.placeholder.invalid')).toBe('stayed');
	});

	it('a registered account with a claimable stash is sent to /merge-guest', async () => {
		expect(await outcome('sarah@example.com')).toBe('/merge-guest');
	});
});

// #282: the views' EventModal edit form invites from this roster, so it must
// keep the layout roster's names (it used to carry only `name`), and the task
// tab suggests the viewer's categories from the same load.
describe('/calendar — roster + task categories for the event modal (#282)', () => {
	it('keeps first/last names on the roster and serves the category list', async () => {
		const bob: RosterRow = {
			userId: 'u-bob',
			firstName: 'Bob',
			lastName: 'Jones',
			email: null,
			role: 'member',
			memberType: 'adult'
		};
		// SAFETY: the fake event carries a user and no `defaultView`, so the
		// redirect arm cannot be reached and `load` returns its data bag.
		const data = (await load(loadEvent(settingsFor(), 'f-rivera', [bob]))) as Exclude<
			Awaited<ReturnType<typeof load>>,
			void
		>;
		await data.calendarData;
		expect(data.familyMembers).toEqual([
			expect.objectContaining({ userId: 'u-bob', firstName: 'Bob', lastName: 'Jones', email: '' })
		]);
		expect(data.taskCategories).toEqual([{ id: 'c1', name: 'Errands' }]);
	});
});
