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
 * `AppPorts` is empty today; each owning module's S5 adds its adapter here.
 * The first planned ones are family's `FamilyCalendarPort` and
 * `MemberTasksPort`, and identity's `CalendarAccessPort` and `AdConsentPort`.
 *
 * Doc: docs/rewrite/playbooks/add-a-port.md#domain-ports
 */
import type { Ctx } from '$lib/kernel/ctx/ctx.server';

/** Cross-module adapters. Grows one owning module at a time; today it has none. */
export type AppPorts = Record<never, never>;

/** Returns `ctx` with every cross-module adapter attached. */
export function wirePorts<C extends Ctx>(ctx: C): C & AppPorts {
	return ctx;
}
