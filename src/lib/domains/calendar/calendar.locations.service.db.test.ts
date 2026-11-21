/**
 * calendar locations service: the Nominatim proxy rule, the 5-result map, the
 * empty-list fallback and the 60/min budget.
 *
 * Expected values come from `api/location-search/+server.ts` and the frozen
 * `calendar.bulk.http.db.test.ts` (location search). The outbound call is
 * scripted on the kernel `Http` port, so nothing here touches the network.
 *
 * Doc: ./README.md#how-to-test
 */
import { describe, expect } from 'vitest';
import { actorFromUser } from '$lib/kernel/ctx/actor';
import type { Db } from '$lib/kernel/db/database.server';
import { createMemoryHttp } from '$lib/kernel/http/outboundHttp';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { searchLocations } from './calendar.locations.service.server';

const NOW = '2026-01-15T09:00:00.000Z';
const SEARCH_URL =
	'https://nominatim.openstreetmap.org/search?format=json&addressdetails=0&limit=5&q=park%20ave';

function viewerCtx(db: Db) {
	return testCtx({ db, now: NOW });
}

/** The thrown refusal, so a test can assert its status and copy. */
async function refusalOf(work: Promise<unknown>): Promise<unknown> {
	return await work.catch((error: unknown) => error);
}

describe('searchLocations', () => {
	rollbackTest('maps the upstream rows onto {label, lat, lon} and calls Nominatim as documented', async (db) => {
		const http = createMemoryHttp();
		const ctx = { ...viewerCtx(db), http };
		const user = await seedUser(db);
		http.reply(SEARCH_URL, {
			body: JSON.stringify([{ display_name: 'Park Avenue', lat: '40.7', lon: '-73.9' }])
		});

		const result = await searchLocations(ctx, actorFromUser(user, 'session'), {
			q: 'park ave',
			clientKey: 'location-search:10.3.0.1'
		});

		expect(result).toEqual({
			results: [{ label: 'Park Avenue', lat: '40.7', lon: '-73.9' }]
		});
		expect(http.calls).toEqual([
			{
				url: SEARCH_URL,
				headers: { 'User-Agent': 'FamilyPlanz/1.0 (test@familyplanz.com)' },
				timeoutMs: 10_000
			}
		]);
	});

	rollbackTest('answers an empty list when the upstream fails or answers non-ok', async (db) => {
		const http = createMemoryHttp();
		const ctx = { ...viewerCtx(db), http };
		const user = await seedUser(db);
		const actor = actorFromUser(user, 'session');

		// Unscripted URL: the port rejects, the legacy catch answers [].
		expect(
			await searchLocations(ctx, actor, { q: 'park', clientKey: 'location-search:10.3.0.2' })
		).toEqual({ results: [] });

		http.reply(SEARCH_URL, { status: 503, body: 'upstream busy' });
		expect(
			await searchLocations(ctx, actor, { q: 'park ave', clientKey: 'location-search:10.3.0.3' })
		).toEqual({ results: [] });
	});

	rollbackTest('requires 2-100 characters of query', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedUser(db);
		const actor = actorFromUser(user, 'session');

		expect(
			await refusalOf(
				searchLocations(ctx, actor, { q: 'p', clientKey: 'location-search:10.3.0.4' })
			)
		).toMatchObject({ status: 400, message: 'q is required and must be 2-100 characters' });
		expect(
			await refusalOf(
				searchLocations(ctx, actor, {
					q: 'x'.repeat(101),
					clientKey: 'location-search:10.3.0.5'
				})
			)
		).toMatchObject({ status: 400, message: 'q is required and must be 2-100 characters' });
	});

	rollbackTest('rate limits a client after 60 searches a minute', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedUser(db);
		const actor = actorFromUser(user, 'session');
		const clientKey = 'location-search:10.3.0.6';

		// An invalid query keeps every allowed attempt off the network; the
		// limiter is consulted first either way.
		for (let attempt = 0; attempt < 60; attempt += 1) {
			const allowed = await refusalOf(searchLocations(ctx, actor, { q: '', clientKey }));
			expect(allowed).toMatchObject({
				status: 400,
				message: 'q is required and must be 2-100 characters'
			});
		}

		expect(
			await refusalOf(searchLocations(ctx, actor, { q: 'park', clientKey }))
		).toMatchObject({ status: 429, message: 'Too many searches. Try again shortly.' });
	});
});
