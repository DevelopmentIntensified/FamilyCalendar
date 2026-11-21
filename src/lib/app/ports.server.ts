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
 * TRANSITION BRIDGES (K-15): identity's two ports are backed by the legacy
 * functions until their owning modules port, because W1 (identity's S5+S6)
 * runs before calendar's and sponsored's S5:
 * - `calendarAccess` → legacy `getAccessibleCalendarIds` (db/actions/calendarScope).
 *   `calendar`'s S5 exports the real adapter and replaces this block.
 * - `adConsent` → legacy `getAdConsentRecords`/`recordAdConsentChange`
 *   (services/adConsentService). `sponsored`'s S5 exports the real adapter.
 *
 * Doc: docs/rewrite/playbooks/add-a-port.md#domain-ports
 */
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import type {
	AdConsentPort,
	CalendarAccessPort,
	IdentityPorts
} from '$lib/domains/identity/index.server';
import { getAccessibleCalendarIds } from '$lib/server/db/actions/calendarScope';
import { getAdConsentRecords, recordAdConsentChange } from '$lib/server/services/adConsentService';

/** Cross-module adapters. Grows one owning module at a time; today identity's two. */
export type AppPorts = IdentityPorts;

/** TRANSITION BRIDGE — `calendar`'s S5 replaces this with its exported adapter. */
const legacyCalendarAccess: CalendarAccessPort = {
	listAccessibleCalendarIds: (userId) => getAccessibleCalendarIds(userId)
};

/** TRANSITION BRIDGE — `sponsored`'s S5 replaces this with its exported adapter. */
const legacyAdConsent: AdConsentPort = {
	listConsentHistory: async (userId) => {
		const rows = await getAdConsentRecords(userId);
		return rows.map((row) => ({ decision: row.decision, recordedAt: row.recordedAt }));
	},
	recordConsentChange: async (userId, previous, next) => {
		await recordAdConsentChange(userId, previous, next);
	}
};

/** Returns `ctx` with every cross-module adapter attached. */
export function wirePorts<C extends Ctx>(ctx: C): C & AppPorts {
	return { ...ctx, calendarAccess: legacyCalendarAccess, adConsent: legacyAdConsent };
}
