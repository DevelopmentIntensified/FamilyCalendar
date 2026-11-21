/**
 * `goldenCtx()` — the ctx for `/api` golden tests: `testCtx` plus the real
 * cross-module adapters, wired exactly as production wires them (../ports.server).
 *
 *   const ctx = () => goldenCtx({ db: testDb() });
 *   const res = await invoke(postBugReport, { ctx: ctx(), user, body });
 *
 * Without the real adapters a frozen golden could not see a ported handler's
 * effect on the other module's rows (a handler reading `ctx.calendarAccess`,
 * for example), and the goldens may not change after S2. Create one ctx per
 * test; a rate-budget test reuses ONE ctx for every request of its burst.
 *
 * The domain ports come from `wirePorts` itself, so identity's two REAL
 * adapters — calendar's `calendarAccess` and sponsored's `adConsent` — are here
 * too, next to family's remaining bridges (../ports.server.ts).
 *
 * `clock` and `ids` are the REAL ones too (`systemClock`, `systemIds`), not the
 * frozen clock and `id-N` counter `testCtx` hands S5 tests: a golden
 * characterizes a legacy handler that read `new Date()` and minted row ids with
 * `generateId`, so it must see legacy-like time and ids. That is why a golden
 * seeding from the ambient month (`billing.http.db.test.ts`, sponsored's) still
 * passes after the port. A golden that wants time pinned passes `now`.
 *
 * `http` is the REAL fetch-wrapping adapter (`createFetchOutboundHttp`), not
 * `testCtx`'s scripted memory one: the frozen location-search golden steers
 * Nominatim by stubbing the global `fetch`, which this adapter calls, so the
 * upstream URL and User-Agent it asserts are the ones the port actually sent.
 *
 * S5 service tests keep `testCtx` and pass a memory fake for each port they
 * exercise; they never need the real adapter.
 *
 * Doc: docs/architecture/testing.md#golden-contract-tests-characterization
 */
import { wirePorts, type AppPorts } from '$lib/app/ports.server';
import { createFetchOutboundHttp } from '$lib/kernel/http/fetchOutboundHttp.server';
import type { Http } from '$lib/kernel/http/outboundHttp';
import { createMemoryPush } from '$lib/kernel/push/push';
import { systemIds, type Ids } from '$lib/kernel/ids/ids';
import { testCtx, type TestCtx, type TestCtxOverrides } from '$lib/kernel/testing/testCtx.server';
import { systemClock, type Clock } from '$lib/kernel/time/clock';

/** What a golden gets: `TestCtx`'s doubles, with production's clock, ids and http. */
export type GoldenCtx = Omit<TestCtx, 'clock' | 'ids' | 'http'> & {
	readonly clock: Clock;
	readonly ids: Ids;
	readonly http: Http;
} & AppPorts;

export function goldenCtx(overrides: TestCtxOverrides = {}): GoldenCtx {
	const ctx = testCtx(overrides);
	return wirePorts({
		...ctx,
		clock: overrides.now === undefined ? systemClock : ctx.clock,
		ids: systemIds,
		// The location-search golden scripts the upstream by stubbing global
		// `fetch`; the adapter captures it per ctx, so the stub is seen.
		http: createFetchOutboundHttp(),
		// This file IS the app's composition root for goldens, so it owns the one
		// environment read: the legacy VAPID route answered `VAPID_PUBLIC_KEY` at
		// request time and the frozen alerts golden sets it before building the
		// ctx. Since Q-020 the answer is gated on both halves, so the config's
		// VAPID pair comes from the environment too. Device push stays off (no
		// golden route sends push).
		config: {
			...ctx.config,
			vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? null,
			vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? null
		},
		push: createMemoryPush({
			webPublicKey: process.env.VAPID_PUBLIC_KEY ?? null,
			devicesConfigured: false
		})
	});
}
