import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PgTable } from 'drizzle-orm/pg-core';

/**
 * The calendar loader's Daily Verse (issue 109).
 *
 * The verse's visibility is a function of TWO persisted facts — the
 * `showDailyVerse` setting and the Dashboard Module switch — and this loader
 * used to read only the first. A user who hid the verse in /account was still
 * served one on /calendar, with no error and nothing to notice it.
 *
 * The table below is the whole truth table of those two facts, because "one says
 * hide, the other says show" is exactly where the defect lived. The stubs are
 * only the DB seam; the visibility rules under test stay real.
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

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted drizzle stub, same shape as family/page.server.test.ts; only the verse gate is under test.
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
	getTasksForUser: vi.fn(async () => []),
	syncRecurringCursors: vi.fn(async () => undefined)
}));

const VERSE = {
	reference: 'Psalm 127:1',
	text: 'Except the LORD build the house, they labour in vain.',
	attribution: 'ESV',
	translation: 'esv',
	fallback: false
};

// oxlint-disable-next-line anti-slop/no-module-mocking -- the verse fetch itself is the thing being gated; spy on it to prove it never runs.
vi.mock('$lib/server/services/verseService', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/services/verseService')>()),
	getTodayVerse: vi.fn(async () => VERSE)
}));

import { load } from './+page.server';
import { getTodayVerse } from '$lib/server/services/verseService';

/** A persisted userSettings row, as the group layout hands it to the loader. */
type SavedSettings = {
	showDailyVerse: boolean;
	verseTranslation: string;
	hiddenDashboardModules: string[] | null;
};

function settingsFor(over: Partial<SavedSettings> = {}): SavedSettings {
	return {
		showDailyVerse: true,
		verseTranslation: 'esv',
		hiddenDashboardModules: [],
		...over
	};
}

/** The load event, carrying the layout's already-loaded facts. */
function loadEvent(settings: SavedSettings, familyId: string | null = 'f-rivera') {
	// SAFETY: the loader reads only `locals.user`, `url.searchParams`,
	// `cookies.get` and `parent()` off the event; each is supplied above with
	// the shape it is read as, and the rest of RequestEvent is irrelevant here.
	return {
		locals: { user: { id: 'u-sarah', email: 'sarah@example.com' } },
		url: { searchParams: new URLSearchParams() },
		cookies: { get: () => undefined, delete: () => {} },
		parent: async () => ({ userSettings: settings, familyId, familyMembers: [] })
	} as Parameters<typeof load>[0];
}

interface CalendarData {
	dailyVerse: typeof VERSE | null;
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

/** The two persisted facts × what the payload must carry. */
const TABLE: Array<{
	what: string;
	settings: SavedSettings;
	verse: boolean;
}> = [
	{
		what: 'setting on, never hidden — the default account',
		settings: settingsFor(),
		verse: true
	},
	{
		what: 'setting on, module hidden in /account — the reported bug',
		settings: settingsFor({ hiddenDashboardModules: ['verse'] }),
		verse: false
	},
	{
		what: 'setting off, module left on — the other way round',
		settings: settingsFor({ showDailyVerse: false }),
		verse: false
	},
	{
		what: 'both off — no verse',
		settings: settingsFor({ showDailyVerse: false, hiddenDashboardModules: ['verse'] }),
		verse: false
	},
	{
		what: 'a null hidden list is not a hidden verse',
		settings: settingsFor({ hiddenDashboardModules: null }),
		verse: true
	},
	{
		what: 'hiding another module leaves the verse alone',
		settings: settingsFor({ hiddenDashboardModules: ['board', 'kids'] }),
		verse: true
	}
];

describe('/calendar — the Daily Verse reads BOTH persisted facts (109)', () => {
	it.each(TABLE)('$what', async ({ settings, verse }) => {
		const data = await runLoad(settings);
		expect(data.dailyVerse === null).toBe(!verse);
		// A hidden verse must cost nothing: the read never runs at all.
		expect(vi.mocked(getTodayVerse).mock.calls.length > 0).toBe(verse);
	});

	it('hiding the verse carries no warning — a hidden module is not a failure', async () => {
		const data = await runLoad(settingsFor({ hiddenDashboardModules: ['verse'] }));
		expect(data.loadWarnings).not.toContain('verse');
	});
});