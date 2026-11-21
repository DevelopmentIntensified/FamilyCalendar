/**
 * Cross-module ports: the ONE place a port is attached to a ctx.
 *
 * A domain that needs rows or decisions from a HIGHER-ranked module cannot
 * import it (rule R1). It declares the port in its own `index.server.ts` —
 * `<M>Ports`, `<M>Ctx = Ctx & <M>Ports` — while the adapter lives in the
 * owning, higher-ranked module, which exports it.
 *
 * `testCtx` (kernel) cannot import domains either, so `wirePorts` is where the
 * adapters meet a ctx: `appCtx` for production and `goldenCtx`
 * (./testing/goldenCtx.server.ts) for the `/api` goldens.
 *
 * Ports wired here:
 * - identity's `calendarAccess` — still a TRANSITION BRIDGE (K-15) over legacy
 *   `getAccessibleCalendarIds` (db/actions/calendarScope), because identity's
 *   S5+S6 ran before calendar's; `calendar`'s S5 exports the real adapter and
 *   replaces this block.
 * - identity's `adConsent` — sponsored's REAL adapter
 *   (`sponsoredAdConsentPort`), built on sponsored's own repo and services and
 *   bound to the ctx it is attached to, so it reads the request's database and
 *   clock (a golden's transaction-scoped test db included).
 * - sponsored's `random` — the one place the generation draw gets randomness
 *   from (rule R5 keeps `Math.random()` in `app`/`kernel` only).
 *
 * Doc: docs/rewrite/playbooks/add-a-port.md#domain-ports
 */
import type { CalendarAccessPort, IdentityPorts } from '$lib/domains/identity/index.server';
import {
	sponsoredAdConsentPort,
	type SponsoredPorts
} from '$lib/domains/sponsored/index.server';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import { getAccessibleCalendarIds } from '$lib/server/db/actions/calendarScope';

/** Cross-module adapters. Grows one owning module at a time. */
export type AppPorts = IdentityPorts & SponsoredPorts;

/** TRANSITION BRIDGE — `calendar`'s S5 replaces this with its exported adapter. */
const legacyCalendarAccess: CalendarAccessPort = {
	listAccessibleCalendarIds: (userId) => getAccessibleCalendarIds(userId)
};

/** Returns `ctx` with every cross-module adapter attached. */
export function wirePorts<C extends Ctx>(ctx: C): C & AppPorts {
	return {
		...ctx,
		calendarAccess: legacyCalendarAccess,
		adConsent: sponsoredAdConsentPort(ctx),
		random: () => Math.random()
	};
}
