/**
 * Golden contract tests for `GET /api/sponsored-events` (#292 G6) — the one
 * Sponsored Events wire route, and the only surface the Android app reads.
 *
 * They pin TODAY's legacy handler: the serve gate (`showAdsAsEvents`), the
 * strict month parameter, the calendar display projection and its accidental
 * "any own event titled 📢 is an ad" rule. They run unchanged after the port.
 * Module README: ./README.md
 */
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { adConsentRecords, events, userSettings } from '$lib/kernel/db/tables.server';
import { invoke, type LegacyUser } from '$lib/kernel/testing/invokeHandlers.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
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

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function getSponsoredEventsFor(
	user: LegacyUser | null,
	query: Readonly<Record<string, string>> = {}
) {
	return invoke(getSponsoredEvents, {
		ctx: testCtx({ db: testDb() }),
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

	it('serves the requested month as calendar display rows marked isAd + amber', async () => {
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
		expect(res.body).toEqual({
			events: [
				{
					id: 'adrowfull00001',
					title: '📢 20% off annual plans',
					description: 'Ends Friday',
					start: '2026-11-05T10:00:00.000Z',
					end: '2026-11-05T10:00:00.000Z',
					allDay: true,
					calendarId: '',
					ownerId: user.id,
					location: null,
					recurrenceFrequency: null,
					recurrenceInterval: null,
					created_at: expect.stringMatching(TIMESTAMP),
					recurrenceByDay: null,
					recurrenceCount: null,
					recurrenceUntil: null,
					reminderMinutes: null,
					mirrorOf: null,
					date: '2026-11-05T10:00:00.000Z',
					color: '#f59e0b',
					isAd: true
				}
			]
		});
	});

	it("lists the month's ad rows in start order", async () => {
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

		const res = await getSponsoredEventsFor(user, { month: '2026-11' });

		expect(wireEvents(res.body).map((event) => event.id)).toEqual([
			'adroweary00001',
			'adrowlate00001'
		]);
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
			expect(event.created_at).toMatch(TIMESTAMP);
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
		// Day 10 at 10:00 UTC is inside the current UTC month whatever today is;
		// the legacy route reads the real clock, so only the month is asserted.
		const now = new Date();
		const start = new Date(
			Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 10, 10, 0, 0)
		).toISOString();
		await seedEvent({
			id: 'adrowcurrent01',
			ownerId: user.id,
			title: '📢 This month',
			start
		});

		const res = await getSponsoredEventsFor(user);

		expect(res.status).toBe(200);
		expect(wireEvents(res.body).map((event) => event.id)).toEqual(['adrowcurrent01']);
	});

	it("windows the month in the user's zone, not UTC", async () => {
		const user = await seedUser(testDb());
		// Honolulu is UTC-10: 05:00Z on 1 November is still 31 October there.
		await seedSettings(user.id, { timeZone: 'Pacific/Honolulu' });
		await seedEvent({
			id: 'adrowhonolulu1',
			ownerId: user.id,
			title: '📢 Island time',
			start: '2026-11-01T05:00:00.000Z'
		});

		const october = await getSponsoredEventsFor(user, { month: '2026-10' });
		expect(wireEvents(october.body).map((event) => event.id)).toEqual(['adrowhonolulu1']);

		const november = await getSponsoredEventsFor(user, { month: '2026-11' });
		expect(wireEvents(november.body).map((event) => event.id)).not.toContain('adrowhonolulu1');
		expect(wireEvents(november.body)).toHaveLength(3);
	});

	it('serves any own event whose title starts with 📢, trimmed, and nothing else', async () => {
		const user = await seedUser(testDb());
		await seedSettings(user.id);
		await seedEvent({
			id: 'adrowtrimmed01',
			ownerId: user.id,
			title: '📢    Extra spaces',
			start: '2026-11-07T10:00:00.000Z'
		});
		await seedEvent({
			id: 'adrowplain0001',
			ownerId: user.id,
			title: 'Dentist',
			description: 'Not an ad',
			start: '2026-11-08T09:00:00.000Z'
		});

		const res = await getSponsoredEventsFor(user, { month: '2026-11' });

		const served = wireEvents(res.body);
		expect(served.map((event) => event.id)).toEqual(['adrowtrimmed01']);
		expect(served[0].title).toBe('📢 Extra spaces');
		expect(served[0].description).toBe('');
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
