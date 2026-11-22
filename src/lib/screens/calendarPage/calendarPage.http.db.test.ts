/**
 * calendarPage page loads against real Postgres: the `/calendar` load (auth,
 * the #056 Dashboard redirect, the guest-merge gate, the deep-link seeds and
 * the composition it hands the page) and `/share-target`'s one 302.
 *
 * The module owns no `/api` route, so there is no golden here (that is why the
 * README says "no HTTP goldens"): these case drive the PORTED handlers through
 * the kernel's harness with a real database, and every expected value comes
 * from the legacy route's own source (`+page.server.ts:31-93`,
 * `share-target/+page.server.ts:5-11`).
 *
 * Doc: ./README.md#how-to-test
 */
import { describe, expect } from 'vitest';
import type { Db } from '$lib/kernel/db/database.server';
import type { JsonValue } from '$lib/kernel/validation/validators';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { invokeLoad } from '$lib/kernel/testing/invokeHandlers.server';
import { seedCalendarRow } from '$lib/domains/calendar/calendar.fixtures.server';
import { calendarPageLoad, shareTargetLoad } from './calendarPage.http.server';
import { CALENDAR_SHARED_TEXT_NOTE } from './calendarPage.url.rules';

const NOW = '2026-01-15T09:00:00.000Z';
const PERSONAL_CAL = 'cal-calpage-http-personal';
const GUEST_EMAIL = 'guest-calpage@anonymous.placeholder.invalid';

function viewerCtx(db: Db) {
	return testCtx({ db, now: NOW });
}

/** The `(calendar)` group layout's data as shell's `ShellScopeModel` shapes it. */
function scopeOf(
	overrides: {
		defaultView?: string;
		roster?: readonly { userId: string; firstName: string; lastName: string | null }[];
		autoParseEventDetails?: boolean | null;
		useCloudAI?: boolean | null;
	} = {}
): Readonly<Record<string, JsonValue>> {
	return {
		settings: {
			weekStart: 'sunday',
			timeZone: 'UTC',
			color: null,
			defaultView: overrides.defaultView ?? 'monthView',
			defaultCalendarId: null,
			syncEventsToFamilyCalendar: null,
			showAdsAsEvents: false,
			autoParseEventDetails: overrides.autoParseEventDetails ?? null,
			useCloudAI: overrides.useCloudAI ?? null,
			showDailyVerse: null,
			hiddenDashboardModules: null
		},
		familyId: null,
		roster: [...(overrides.roster ?? [])]
	};
}

/** A thrown Kit redirect, as the harness surfaces it. */
async function redirectOf(run: () => Promise<unknown>): Promise<{ status: number; location: string }> {
	try {
		await run();
	} catch (cause) {
		if (typeof cause === 'object' && cause !== null && 'status' in cause && 'location' in cause) {
			const { status, location } = cause as { status: unknown; location: unknown };
			if (typeof status === 'number' && typeof location === 'string') return { status, location };
		}
		throw cause;
	}
	throw new Error('expected a redirect');
}

describe('/calendar — auth and the Dashboard redirect', () => {
	rollbackTest('sends a signed-out visit to /login', async (db) => {
		const ctx = viewerCtx(db);
		expect(
			await redirectOf(() =>
				invokeLoad(calendarPageLoad, {
					ctx,
					actor: null,
					path: '/calendar',
					parentData: scopeOf()
				})
			)
		).toEqual({ status: 302, location: '/login' });
	});

	rollbackTest('a Dashboard default redirects unless the URL says otherwise (#056)', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedUser(db);
		const scope = scopeOf({ defaultView: 'dashboard' });

		expect(
			await redirectOf(() =>
				invokeLoad(calendarPageLoad, { ctx, user, path: '/calendar', parentData: scope })
			)
		).toEqual({ status: 302, location: '/calendar/dashboard' });

		// `?dashboardView` is the escape hatch the dashboard's back link uses.
		const escaped = await invokeLoad(calendarPageLoad, {
			ctx,
			user,
			path: '/calendar',
			query: { dashboardView: '1' },
			parentData: scope
		});
		await escaped.grid;
		expect(escaped.shell.seeds.view).toBeNull();
	});

	rollbackTest('?view= or ?date= bypasses the Dashboard redirect', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedUser(db);
		const scope = scopeOf({ defaultView: 'dashboard' });
		await seedCalendarRow(PERSONAL_CAL, { ownerId: user.id }, db);

		const byView = await invokeLoad(calendarPageLoad, {
			ctx,
			user,
			path: '/calendar',
			query: { view: 'week' },
			parentData: scope
		});
		await byView.grid;
		expect(byView.shell.seeds.view).toBe('week');

		const byDate = await invokeLoad(calendarPageLoad, {
			ctx,
			user,
			path: '/calendar',
			query: { date: '2026-03-05' },
			parentData: scope
		});
		await byDate.grid;
		expect(byDate.shell.seeds.date).toBe('2026-03-05');
	});
});

describe('/calendar — the guest-merge gate', () => {
	rollbackTest('an Anonymous Account with a stale stash cookie is not sent to /merge-guest (#241)', async (db) => {
		const ctx = viewerCtx(db);
		const guest = await seedUser(db, { email: GUEST_EMAIL });
		await seedCalendarRow(PERSONAL_CAL, { ownerId: guest.id }, db);

		const model = await invokeLoad(calendarPageLoad, {
			ctx,
			user: guest,
			path: '/calendar',
			cookies: { guest_merge: 'someone-else' },
			parentData: scopeOf()
		});
		await model.grid;

		expect(model.shell.viewerId).toBe(guest.id);
	});

	rollbackTest('sends a registered account to /merge-guest while the stash is claimable', async (db) => {
		const ctx = viewerCtx(db);
		const guest = await seedUser(db, { email: GUEST_EMAIL });
		const user = await seedUser(db);

		expect(
			await redirectOf(() =>
				invokeLoad(calendarPageLoad, {
					ctx,
					user,
					path: '/calendar',
					cookies: { guest_merge: guest.id },
					parentData: scopeOf()
				})
			)
		).toEqual({ status: 302, location: '/merge-guest' });
	});

	rollbackTest('drops a stash that no longer names an Anonymous Account', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedUser(db);
		const other = await seedUser(db);
		await seedCalendarRow(PERSONAL_CAL, { ownerId: user.id }, db);

		const model = await invokeLoad(calendarPageLoad, {
			ctx,
			user,
			path: '/calendar',
			cookies: { guest_merge: other.id },
			parentData: scopeOf()
		});
		await model.grid;

		expect(model.shell.viewerId).toBe(user.id);
	});
});

describe('/calendar — deep-link seeds', () => {
	rollbackTest('reads a real date and a known view, carries the query and the share seed', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedUser(db);
		await seedCalendarRow(PERSONAL_CAL, { ownerId: user.id }, db);

		const model = await invokeLoad(calendarPageLoad, {
			ctx,
			user,
			path: '/calendar',
			query: { date: '2026-03-05', view: 'day', quickadd: 'Lunch Friday' },
			parentData: scopeOf()
		});
		await model.grid;

		expect(model.shell.seeds).toEqual({
			date: '2026-03-05',
			view: 'day',
			edit: null,
			create: { quickAdd: 'Lunch Friday', note: CALENDAR_SHARED_TEXT_NOTE }
		});
	});

	rollbackTest("carries the person's quick-add switches into the model", async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedUser(db);
		await seedCalendarRow(PERSONAL_CAL, { ownerId: user.id }, db);

		const model = await invokeLoad(calendarPageLoad, {
			ctx,
			user,
			path: '/calendar',
			parentData: scopeOf({ autoParseEventDetails: false, useCloudAI: false })
		});
		await model.grid;

		// Legacy read them off `data.userSettings` as `=== false` / `?? true`;
		// the page keeps the raw null and gates it in `calendarPage.quickAdd.rules`.
		expect(model.shell.settings.autoParseEventDetails).toBe(false);
		expect(model.shell.settings.useCloudAI).toBe(false);
	});

	rollbackTest('ignores a junk date and a junk view instead of half-applying them', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedUser(db);
		await seedCalendarRow(PERSONAL_CAL, { ownerId: user.id }, db);

		const model = await invokeLoad(calendarPageLoad, {
			ctx,
			user,
			path: '/calendar',
			query: { date: '2026-02-31', view: 'quarter' },
			parentData: scopeOf({ roster: [{ userId: user.id, firstName: 'Mia', lastName: 'R' }] })
		});
		await model.grid;

		expect(model.shell.seeds.date).toBeNull();
		expect(model.shell.seeds.view).toBeNull();
		expect(model.shell.roster[0]?.firstName).toBe('Mia');
	});
});

describe('/share-target', () => {
	rollbackTest('302s into /calendar?quickadd with the folded text, signed in or not', async (db) => {
		const ctx = viewerCtx(db);
		const expected =
			'/calendar?quickadd=' +
			encodeURIComponent('Lunch Friday https://example.test/a');
		expect(
			await redirectOf(() =>
				invokeLoad(shareTargetLoad, {
					ctx,
					actor: null,
					path: '/share-target',
					query: { text: 'Lunch Friday', url: 'https://example.test/a' }
				})
			)
		).toEqual({ status: 302, location: expected });
	});
});
