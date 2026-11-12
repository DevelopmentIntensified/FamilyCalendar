/**
 * Golden contract tests for `GET /api/daily-verse` (port sheet:
 * docs/rewrite/modules/verse.md). Committed mode, because the legacy handler
 * reads the settings through the legacy `db` singleton. The wire pinned here is
 * what the Android app depends on (docs/guides/task-api-spec.md) and must pass
 * unchanged after S6.
 * Doc: ./README.md#invariants
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
	dashboardModuleSwitches,
	families,
	familyMembers,
	userSettings
} from '$lib/kernel/db/tables.server';
import { invoke } from '$lib/kernel/testing/invokeHandlers.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { testDb, truncateAll } from '$lib/kernel/testing/testDb.server';
// The ROUTE module, not the legacy service: the route is what clients hit, and
// after the port it re-exports the new handler, so this import never changes.
import { GET as getDailyVerse } from '../../../routes/api/daily-verse/+server';

const ctx = () => testCtx({ db: testDb() });

const ATTRIBUTION = 'Public domain.';

// 2026 is a common year, so the ordinal is the plain day of year: index =
// ordinal % 40 over the 40 curated verses. 0 → John 3:16, 1 → Psalm 23:1,
// 5 → Jeremiah 29:11.
const JOHN_3_16 = {
	reference: 'John 3:16',
	text: 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.'
};
const PSALM_23_1 = {
	reference: 'Psalm 23:1',
	text: 'The LORD is my shepherd; I shall not want.'
};
const JEREMIAH_29_11 = {
	reference: 'Jeremiah 29:11',
	text: 'For I know the thoughts that I think toward you, saith the LORD, thoughts of peace, and not of evil, to give you an expected end.'
};

type SettingsValues = Partial<typeof userSettings.$inferInsert>;

/** The viewer's settings row, with the verse switched on unless a test says otherwise. */
async function seedVerseSettings(userId: string, values: SettingsValues = {}) {
	await testDb()
		.insert(userSettings)
		.values({ userId, showDailyVerse: true, ...values });
}

/** A family with the viewer as its only member, plus any master-switch rows. */
async function seedFamily(
	userId: string,
	switches: readonly { module: string; enabled: boolean }[] = []
) {
	const [family] = await testDb()
		.insert(families)
		.values({ name: 'Test Family' })
		.returning();
	await testDb().insert(familyMembers).values({ userId, familyId: family.id });
	for (const row of switches) {
		await testDb()
			.insert(dashboardModuleSwitches)
			.values({ familyId: family.id, module: row.module, enabled: row.enabled });
	}
	return family;
}

describe('GET /api/daily-verse', () => {
	beforeEach(truncateAll);

	it('answers 401 {"error":"Unauthorized"} when signed out, before the date check', async () => {
		const res = await invoke(getDailyVerse, {
			ctx: ctx(),
			path: '/api/daily-verse',
			query: { date: 'not-a-date' }
		});
		expect(res.status).toBe(401);
		expect(res.body).toEqual({ error: 'Unauthorized' });
	});

	it.each<[string, { reference: string; text: string }]>([
		['2026-01-01', PSALM_23_1],
		['2026-02-09', JOHN_3_16],
		['2026-12-31', JEREMIAH_29_11]
	])("answers that day's verse for ?date=%s", async (date, verse) => {
		const user = await seedUser(testDb());
		await seedVerseSettings(user.id);
		const res = await invoke(getDailyVerse, {
			ctx: ctx(),
			user,
			path: '/api/daily-verse',
			query: { date }
		});
		expect(res.status).toBe(200);
		// Exactly three fields: `translation` and `fallback` never reach the wire.
		expect(res.body).toEqual({ verse: { ...verse, attribution: ATTRIBUTION } });
	});

	it("answers today's verse when ?date is absent", async () => {
		const user = await seedUser(testDb());
		await seedVerseSettings(user.id);
		const res = await invoke(getDailyVerse, { ctx: ctx(), user, path: '/api/daily-verse' });
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			verse: {
				reference: expect.any(String),
				text: expect.any(String),
				attribution: ATTRIBUTION
			}
		});
	});

	it("ignores the viewer's verseTranslation setting (bundled ESV text on every response)", async () => {
		const user = await seedUser(testDb());
		await seedVerseSettings(user.id, { verseTranslation: 'kjv' });
		const res = await invoke(getDailyVerse, {
			ctx: ctx(),
			user,
			path: '/api/daily-verse',
			query: { date: '2026-01-01' }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ verse: { ...PSALM_23_1, attribution: ATTRIBUTION } });
	});

	it.each(['2026-11-32', '11/02/2026', '2026-02-30', '2026-1-01', 'today', ''])(
		'answers 400 {"error":"Invalid date"} for date=%s',
		async (date) => {
			const user = await seedUser(testDb());
			await seedVerseSettings(user.id);
			const res = await invoke(getDailyVerse, {
				ctx: ctx(),
				user,
				path: '/api/daily-verse',
				query: { date }
			});
			expect(res.status).toBe(400);
			expect(res.body).toEqual({ error: 'Invalid date' });
		}
	);

	it('validates the date before reading the settings (no row, invalid date → 400, not null)', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(getDailyVerse, {
			ctx: ctx(),
			user,
			path: '/api/daily-verse',
			query: { date: 'today' }
		});
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'Invalid date' });
	});

	it('answers {verse:null} when the viewer never saved a settings row', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(getDailyVerse, {
			ctx: ctx(),
			user,
			path: '/api/daily-verse',
			query: { date: '2026-01-01' }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ verse: null });
	});

	it('answers {verse:null} when showDailyVerse is off', async () => {
		const user = await seedUser(testDb());
		// `false` is the column default: a row that never touched the toggle
		// stores it, and the verse is off.
		await seedVerseSettings(user.id, { showDailyVerse: false });
		const res = await invoke(getDailyVerse, {
			ctx: ctx(),
			user,
			path: '/api/daily-verse',
			query: { date: '2026-01-01' }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ verse: null });
	});

	it('answers {verse:null} when showDailyVerse was saved as null', async () => {
		const user = await seedUser(testDb());
		await seedVerseSettings(user.id, { showDailyVerse: null });
		const res = await invoke(getDailyVerse, {
			ctx: ctx(),
			user,
			path: '/api/daily-verse',
			query: { date: '2026-01-01' }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ verse: null });
	});

	it('answers {verse:null} when the verse module is in the viewer hidden list', async () => {
		const user = await seedUser(testDb());
		await seedVerseSettings(user.id, {
			showDailyVerse: true,
			hiddenDashboardModules: ['verse']
		});
		const res = await invoke(getDailyVerse, {
			ctx: ctx(),
			user,
			path: '/api/daily-verse',
			query: { date: '2026-01-01' }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ verse: null });
	});

	it('keeps the verse visible when the hidden list names other modules', async () => {
		const user = await seedUser(testDb());
		await seedVerseSettings(user.id, {
			showDailyVerse: true,
			hiddenDashboardModules: ['board', 'groceries', 'not-a-module']
		});
		const res = await invoke(getDailyVerse, {
			ctx: ctx(),
			user,
			path: '/api/daily-verse',
			query: { date: '2026-01-01' }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ verse: { ...PSALM_23_1, attribution: ATTRIBUTION } });
	});

	it('keeps the verse visible when the family switch for verse is off (personal module)', async () => {
		const user = await seedUser(testDb());
		await seedVerseSettings(user.id, { showDailyVerse: true });
		await seedFamily(user.id, [{ module: 'verse', enabled: false }]);
		const res = await invoke(getDailyVerse, {
			ctx: ctx(),
			user,
			path: '/api/daily-verse',
			query: { date: '2026-01-01' }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ verse: { ...PSALM_23_1, attribution: ATTRIBUTION } });
	});

	it("reads only the caller's settings, even when the family hides other modules", async () => {
		const viewer = await seedUser(testDb());
		const partner = await seedUser(testDb());
		const family = await seedFamily(viewer.id, [{ module: 'groceries', enabled: false }]);
		await testDb().insert(familyMembers).values({ userId: partner.id, familyId: family.id });
		await seedVerseSettings(viewer.id, { showDailyVerse: true });
		await seedVerseSettings(partner.id, { showDailyVerse: false });

		const hidden = await invoke(getDailyVerse, {
			ctx: ctx(),
			user: partner,
			path: '/api/daily-verse',
			query: { date: '2026-01-01' }
		});
		expect(hidden.status).toBe(200);
		expect(hidden.body).toEqual({ verse: null });

		const shown = await invoke(getDailyVerse, {
			ctx: ctx(),
			user: viewer,
			path: '/api/daily-verse',
			query: { date: '2026-01-01' }
		});
		expect(shown.status).toBe(200);
		expect(shown.body).toEqual({ verse: { ...PSALM_23_1, attribution: ATTRIBUTION } });
	});
});
