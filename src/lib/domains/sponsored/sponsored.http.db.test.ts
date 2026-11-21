/**
 * Golden contract tests for `GET /api/sponsored-events` (#292 G6) — the one
 * Sponsored Events wire route, and the only surface the Android app reads.
 *
 * They were written against the S2 legacy handler: the serve gate
 * (`showAdsAsEvents`), the strict month parameter, the calendar display
 * projection and its accidental "any own event titled 📢 is an ad" rule. The
 * rows that pinned those accidents were flipped with the owner's answers
 * (Q-040 B: an own 📢 Event is not inventory; Q-041 B: the draw is seeded;
 * Q-042 B: `created_at` is the month start); every other row is untouched.
 * Module README: ./README.md
 */
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { adConsentRecords, events, userSettings } from '$lib/kernel/db/tables.server';
import { invoke, type LegacyUser } from '$lib/kernel/testing/invokeHandlers.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { goldenCtx } from '$lib/app/testing/goldenCtx.server';
import { testDb, truncateAll } from '$lib/kernel/testing/testDb.server';
import type { JsonValue } from '$lib/kernel/validation/validators';
// The ROUTE is what clients hit, and after the port it re-exports the new
// handler, so this import never changes.
import { GET as getSponsoredEvents } from '../../../routes/api/sponsored-events/+server';

/** The wire row the route projects: the calendar display shape + ad marking. */
const WireEvent = z.strictObject({
	id: z.string(),
	title: z.string(),
	description: z.string(),
	start: z.string(),
	end: z.string(),
	allDay: z.boolean(),
	calendarId: z.string(),
	ownerId: z.string(),
	location: z.null(),
	recurrenceFrequency: z.null(),
	recurrenceInterval: z.null(),
	created_at: z.string(),
	recurrenceByDay: z.null(),
	recurrenceCount: z.null(),
	recurrenceUntil: z.null(),
	reminderMinutes: z.null(),
	mirrorOf: z.null(),
	date: z.string(),
	color: z.string(),
	isAd: z.literal(true)
});
type WireEvent = z.infer<typeof WireEvent>;

const SponsoredEventsBody = z.strictObject({ events: z.array(WireEvent) });

function getSponsoredEventsFor(
	user: LegacyUser | null,
	query: Readonly<Record<string, string>> = {}
) {
	return invoke(getSponsoredEvents, {
		ctx: goldenCtx({ db: testDb() }),
		user,
		path: '/api/sponsored-events',
		query
	});
}

/** The response's `events` array, parsed at the boundary. */
function wireEvents(body: JsonValue | null): WireEvent[] {
	return SponsoredEventsBody.parse(body).events;
}

/** The settings row the gate reads; UTC so the month window never depends on the host zone. */
async function seedSettings(
	userId: string,
	values: { showAdsAsEvents?: boolean | null; timeZone?: string | null } = {}
): Promise<void> {
	await testDb()
		.insert(userSettings)
		.values({ userId, showAdsAsEvents: true, timeZone: 'UTC', ...values });
}

/** An Event row a user owns; `start` is the stored ISO instant. */
async function seedEvent(input: {
	id: string;
	ownerId: string;
	title: string;
	start: string;
	description?: string | null;
}): Promise<void> {
	await testDb()
		.insert(events)
		.values({
			id: input.id,
			ownerId: input.ownerId,
			title: input.title,
			start: input.start,
			description: input.description ?? null,
			// Deliberately not all-day: every served ad is projected as all-day.
			allDay: false
		});
}

describe('GET /api/sponsored-events', () => {
	beforeEach(truncateAll);

	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const res = await getSponsoredEventsFor(null);
		expect(res.status).toBe(401);
		expect(res.body).toEqual({ error: 'Unauthorized' });
	});

	it.each(['2026-13', '2026-00', '2026-1', 'nov', '2026-11-01', ''])(
		'answers 400 {"error":"Invalid month"} for month=%s',
		async (month) => {
			const user = await seedUser(testDb());
			await seedSettings(user.id);

			const res = await getSponsoredEventsFor(user, { month });

			expect(res.status).toBe(400);
			expect(res.body).toEqual({ error: 'Invalid month' });
		}
	);

	it('serves the requested month as calendar display rows marked isAd + amber, and never an own 📢 row', async () => {
		const user = await seedUser(testDb());
		await seedSettings(user.id);
		await seedEvent({
			id: 'adrowfull00001',
			ownerId: user.id,
			title: '📢 20% off annual plans',
			description: 'Ends Friday',
			start: '2026-11-05T10:00:00.000Z'
		});

		const res = await getSponsoredEventsFor(user, { month: '2026-11' });

		expect(res.status).toBe(200);
		const served = wireEvents(res.body);
		expect(served).toHaveLength(3);
		for (const event of served) {
			expect(event).toMatchObject({
				description: '',
				allDay: true,
				calendarId: '',
				ownerId: user.id,
				location: null,
				recurrenceFrequency: null,
				recurrenceInterval: null,
				created_at: '2026-11-01T00:00:00.000Z',
				recurrenceByDay: null,
				recurrenceCount: null,
				recurrenceUntil: null,
				reminderMinutes: null,
				mirrorOf: null,
				color: '#f59e0b',
				isAd: true
			});
			// 10:00 in the user's zone (UTC here), on a day of the month.
			expect(event.start).toMatch(/^2026-11-(0[1-9]|[12]\d|30)T10:00:00\.000Z$/);
			expect(event.end).toBe(event.start);
			expect(event.date).toBe(event.start);
			expect(event.id).toMatch(/^[a-z0-9]{15}$/);
		}
		// Q-040 B: an own 📢 row is the user's calendar data, never ad inventory.
		expect(served.map((event) => event.id)).not.toContain('adrowfull00001');
	});

	it('draws the same month the same way on every request, and never the own 📢 rows', async () => {
		const user = await seedUser(testDb());
		await seedSettings(user.id);
		await seedEvent({
			id: 'adrowlate00001',
			ownerId: user.id,
			title: '📢 Later',
			start: '2026-11-20T10:00:00.000Z'
		});
		await seedEvent({
			id: 'adroweary00001',
			ownerId: user.id,
			title: '📢 Earlier',
			start: '2026-11-03T10:00:00.000Z'
		});

		const first = await getSponsoredEventsFor(user, { month: '2026-11' });
		const second = await getSponsoredEventsFor(user, { month: '2026-11' });

		const drawn = wireEvents(first.body);
		expect(drawn).toHaveLength(3);
		// Q-041 B: the draw is seeded per user and month, so the values repeat.
		expect(
			wireEvents(second.body).map((event) => [event.title, event.start, event.created_at])
		).toEqual(drawn.map((event) => [event.title, event.start, event.created_at]));
		// Q-040 B: neither own 📢 row is served.
		const ids = drawn.map((event) => event.id);
		expect(ids).not.toContain('adrowlate00001');
		expect(ids).not.toContain('adroweary00001');
	});

	it('generates three Sponsored Events when the month has none', async () => {
		const user = await seedUser(testDb());
		await seedSettings(user.id);

		const res = await getSponsoredEventsFor(user, { month: '2026-11' });

		expect(res.status).toBe(200);
		const generated = wireEvents(res.body);
		expect(generated).toHaveLength(3);
		// Four templates remain, so three draws never repeat one.
		expect(new Set(generated.map((event) => event.title)).size).toBe(3);
		for (const event of generated) {
			expect(event).toMatchObject({
				description: '',
				allDay: true,
				calendarId: '',
				ownerId: user.id,
				location: null,
				recurrenceFrequency: null,
				recurrenceInterval: null,
				recurrenceByDay: null,
				recurrenceCount: null,
				recurrenceUntil: null,
				reminderMinutes: null,
				mirrorOf: null,
				color: '#f59e0b',
				isAd: true
			});
			expect(event.title).toMatch(
				/^📢 (Upgrade to Premium and unlock unlimited family members!|Get 20% off annual plans this month only!|Check out our new archive retention feature - preserve memories forever!|Invite your extended family - groups now support 5\+ members!)$/
			);
			// 10:00 in the user's zone (UTC here), on a day of the month.
			expect(event.start).toMatch(/^2026-11-(0[1-9]|[12]\d|30)T10:00:00\.000Z$/);
			expect(event.end).toBe(event.start);
			expect(event.date).toBe(event.start);
			// Q-042 B: `created_at` is the served month's start, not the request instant.
			expect(event.created_at).toBe('2026-11-01T00:00:00.000Z');
			expect(event.id).toMatch(/^[a-z0-9]{15}$/);
		}
		// Generation is virtual: the request writes no Event and no adEvents row.
		expect(await testDb().select().from(events)).toEqual([]);
	});

	it('withholds ads when the user has no settings row, even with 📢 rows in the month', async () => {
		const user = await seedUser(testDb());
		await seedEvent({
			id: 'adrownosettings',
			ownerId: user.id,
			title: '📢 Sale',
			start: '2026-11-05T10:00:00.000Z'
		});

		const res = await getSponsoredEventsFor(user, { month: '2026-11' });

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ events: [] });
	});

	it('withholds ads when showAdsAsEvents is false', async () => {
		const user = await seedUser(testDb());
		await seedSettings(user.id, { showAdsAsEvents: false });
		await seedEvent({
			id: 'adrowflagfalse',
			ownerId: user.id,
			title: '📢 Sale',
			start: '2026-11-05T10:00:00.000Z'
		});

		const res = await getSponsoredEventsFor(user, { month: '2026-11' });

		expect(res.body).toEqual({ events: [] });
	});

	it('withholds ads when showAdsAsEvents is null', async () => {
		const user = await seedUser(testDb());
		await seedSettings(user.id, { showAdsAsEvents: null });
		await seedEvent({
			id: 'adrowflagnull',
			ownerId: user.id,
			title: '📢 Sale',
			start: '2026-11-05T10:00:00.000Z'
		});

		const res = await getSponsoredEventsFor(user, { month: '2026-11' });

		expect(res.body).toEqual({ events: [] });
	});

	it('treats a consent record as evidence, never permission, and writes none on a read', async () => {
		const user = await seedUser(testDb());
		await seedSettings(user.id, { showAdsAsEvents: false });
		await seedEvent({
			id: 'adrowconsent1',
			ownerId: user.id,
			title: '📢 Sale',
			start: '2026-11-05T10:00:00.000Z'
		});
		const [granted] = await testDb()
			.insert(adConsentRecords)
			.values({ userId: user.id, decision: 'granted' })
			.returning();

		const res = await getSponsoredEventsFor(user, { month: '2026-11' });

		expect(res.body).toEqual({ events: [] });
		const records = await testDb()
			.select()
			.from(adConsentRecords)
			.where(eq(adConsentRecords.userId, user.id));
		expect(records.map((record) => [record.id, record.decision])).toEqual([
			[granted.id, 'granted']
		]);
	});

	it('uses the current month in the user zone when month is absent', async () => {
		const user = await seedUser(testDb());
		await seedSettings(user.id);
		// The legacy route reads the real clock, so the current month is worked
		// from the test's own clock: the starts fall inside it and `created_at`
		// is its first instant in UTC.
		const now = new Date();
		const key = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
			.toISOString()
			.slice(0, 7);

		const res = await getSponsoredEventsFor(user);

		expect(res.status).toBe(200);
		const served = wireEvents(res.body);
		expect(served).toHaveLength(3);
		for (const event of served) {
			expect(event.start.startsWith(key)).toBe(true);
			expect(event.created_at).toBe(`${key}-01T00:00:00.000Z`);
		}
	});

	it("windows the month in the user's zone, not UTC", async () => {
		const user = await seedUser(testDb());
		// Honolulu is UTC-10: its month opens at 10:00Z, and 10:00 local is 20:00Z.
		await seedSettings(user.id, { timeZone: 'Pacific/Honolulu' });

		const october = wireEvents((await getSponsoredEventsFor(user, { month: '2026-10' })).body);
		expect(october).toHaveLength(3);
		for (const event of october) {
			expect(event.start).toMatch(/^2026-10-(0[1-9]|[12]\d|3[01])T20:00:00\.000Z$/);
			expect(event.created_at).toBe('2026-10-01T10:00:00.000Z');
		}

		const november = wireEvents((await getSponsoredEventsFor(user, { month: '2026-11' })).body);
		expect(november).toHaveLength(3);
		for (const event of november) {
			expect(event.start).toMatch(/^2026-11-(0[1-9]|[12]\d|30)T20:00:00\.000Z$/);
			expect(event.created_at).toBe('2026-11-01T10:00:00.000Z');
		}
	});

	it('does not serve an own event whose title starts with 📢, and generates the month instead', async () => {
		const user = await seedUser(testDb());
		await seedSettings(user.id);
		await seedEvent({
			id: 'adrowtrimmed01',
			ownerId: user.id,
			title: '📢    Extra spaces',
			start: '2026-11-07T10:00:00.000Z'
		});

		const res = await getSponsoredEventsFor(user, { month: '2026-11' });

		const served = wireEvents(res.body);
		expect(served).toHaveLength(3);
		expect(served.map((event) => event.id)).not.toContain('adrowtrimmed01');
		// The typed marker is not stripped and served back as an ad either.
		expect(served.every((event) => event.title !== '📢 Extra spaces')).toBe(true);
	});

	it("never serves another user's 📢 event", async () => {
		const user = await seedUser(testDb());
		const other = await seedUser(testDb());
		await seedSettings(user.id);
		await seedEvent({
			id: 'adrowother0001',
			ownerId: other.id,
			title: '📢 Not yours',
			start: '2026-11-05T10:00:00.000Z'
		});

		const res = await getSponsoredEventsFor(user, { month: '2026-11' });

		expect(wireEvents(res.body).map((event) => event.id)).not.toContain('adrowother0001');
		expect(wireEvents(res.body)).toHaveLength(3);
	});
});
