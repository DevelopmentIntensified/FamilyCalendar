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
 * TRANSITION BRIDGES (each adapter names the module whose S5 replaces it):
 * - identity's `CalendarAccessPort` over legacy `getAccessibleCalendarIds`
 *   (calendar's S5 exports the adapter over its own service);
 * - identity's `AdConsentPort` over legacy `adConsentService` (sponsored's S5).
 * Both must keep reading today's rows so the frozen identity goldens see the
 * calendars and consent records another module owns. They are the production
 * adapters until those modules port; no route or endpoint composes a port.
 *
 * Doc: docs/rewrite/playbooks/add-a-port.md#domain-ports
 */
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import type {
	AdConsentPort,
	CalendarAccessPort
} from '$lib/domains/identity/index.server';
import { getAccessibleCalendarIds } from '$lib/server/db/actions/calendarScope';
import {
	getAdConsentRecords,
	recordAdConsentChange
} from '$lib/server/services/adConsentService';

/** Cross-module adapters. Grows one owning module at a time. */
export type AppPorts = {
	readonly calendarAccess: CalendarAccessPort;
	readonly adConsent: AdConsentPort;
};

/** Returns `ctx` with every cross-module adapter attached. */
export function wirePorts<C extends Ctx>(ctx: C): C & AppPorts {
	return {
		...ctx,
		calendarAccess: {
			listAccessibleCalendarIds: async (userId) => await getAccessibleCalendarIds(userId)
		},
		adConsent: {
			listConsentHistory: async (userId) => await getAdConsentRecords(userId),
			recordConsentChange: async (userId, previous, next) => {
				await recordAdConsentChange(userId, previous, next);
			}
		}
	};
}
