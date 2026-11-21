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
 * Ports wired here that are already REAL (the owning module ported):
 * - identity's `calendarAccess` → `createCalendarAccessPort(ctx)`, one home for
 *   the accessible-calendar scope read (`listAccessibleCalendarIds`).
 * - identity's `adConsent` → sponsored's `sponsoredAdConsentPort(ctx)`, built on
 *   sponsored's own repo and services and bound to the ctx it is attached to, so
 *   it reads the request's database and clock (a golden's transaction-scoped
 *   test db included).
 * - family's `calendar.createFamilyCalendar` → `createFamilyCalendarPort()`,
 *   which writes through the ctx family hands it, so the row joins family's
 *   create transaction.
 * - family's `tasks.unassignMemberTasks` → tasks' REAL
 *   `unassignMemberTasks(ctx, familyId, userId)` from
 *   `$lib/domains/tasks/index.server`, the assignment clear alone (family
 *   deletes the roster row itself, AFTER this call), writing through the ctx
 *   family hands it so the clear joins family's removal transaction.
 * - family's `moduleSwitches.listFamilyModuleSwitches` → dashboardModules'
 *   exported `listFamilyModuleSwitches` (Q-030; a real adapter, not a bridge).
 *
 * family's remaining two ports are bridged, because their owning modules have
 * no use-case yet:
 * - `childAccount.createChildAccount` → legacy `createNewUser`, the one helper
 *   that writes the child's `users` row, `email` account, settings and personal
 *   calendar. Identity's S5 has no such use-case and `calendars` belongs to
 *   calendar, so both owning modules must export one before this bridge goes.
 * - `inviteLink.mintInviteLink` → `oslo/jwt` with `EMAILSECRET` plus the legacy
 *   `getUrl()`: the legacy invite page still validates the token with that
 *   secret, and only `app` may read the environment (R6). A kernel token port
 *   would be the real home; it does not exist yet.
 *
 * dashboardModules' Q-030 adapter is an exception in rank terms: it is not a
 * bridge, because `family` declares that port for a HIGHER-ranked module
 * (`dashboardModules` implements it). This module's other family need, the
 * viewer's role, is a direct call (family is rank 4).
 *
 * Doc: docs/rewrite/playbooks/add-a-port.md#domain-ports
 */
import { TimeSpan } from 'oslo';
import { createJWT } from 'oslo/jwt';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import {
	createCalendarAccessPort,
	createFamilyCalendarPort
} from '$lib/domains/calendar/index.server';
import { listFamilyModuleSwitches } from '$lib/domains/dashboardModules/index.server';
import type {
	FamilyChildAccountPort,
	FamilyInviteLinkPort,
	FamilyModuleSwitchesPort,
	FamilyPorts
} from '$lib/domains/family/index.server';
import type { IdentityPorts } from '$lib/domains/identity/index.server';
import { sponsoredAdConsentPort } from '$lib/domains/sponsored/index.server';
import { unassignMemberTasks } from '$lib/domains/tasks/index.server';
import { createEmailPerson } from '$lib/domains/identity/index.server';
import { ensurePersonalCalendar } from '$lib/domains/calendar/index.server';
import { getUrl } from '$lib/utils/getUrl';

/** Cross-module adapters. Grows one owning module at a time. */
export type AppPorts = IdentityPorts & FamilyPorts;

/** `EMAILSECRET` signed the legacy invite tokens; the legacy invite page still validates with it. */
const INVITE_TOKEN_SECRET = new TextEncoder().encode(process.env.EMAILSECRET ?? '');

/** One day, as both legacy invite doors minted. */
const INVITE_TOKEN_LIFETIME = new TimeSpan(1, 'd');

/** Q-030: dashboardModules' S5 exports the real family-switch read. */
const dashboardModuleSwitches: FamilyModuleSwitchesPort = {
	listFamilyModuleSwitches: async (ctx, familyId) => listFamilyModuleSwitches(ctx, familyId)
};

/**
 * The child door's account: identity's verified person (user row + `email`
 * account + settings) plus calendar's lazy personal calendar — the same
 * composition access' sign-up uses, in place of the legacy `createNewUser`.
 */
const childAccount: FamilyChildAccountPort = {
	createChildAccount: async (ctx, input) => {
		const person = await createEmailPerson(ctx, {
			email: input.email,
			firstName: input.firstName,
			lastName: input.lastName
		});
		await ensurePersonalCalendar(ctx, person.id);
		return {
			id: person.id,
			firstName: person.firstName,
			lastName: person.lastName,
			email: person.email
		};
	}
};

/** TRANSITION BRIDGE — a kernel token port (or access' mail tokens) replaces this. */
const legacyInviteLink: FamilyInviteLinkPort = {
	mintInviteLink: async ({ email, firstName, lastName, familyId, inviteCode }) => {
		const token = await createJWT(
			'HS256',
			INVITE_TOKEN_SECRET,
			{ email, firstName, lastName, familyId, inviteCode },
			{
				headers: {
					alg: 'HS256',
					typ: 'JWT'
				},
				expiresIn: INVITE_TOKEN_LIFETIME
			}
		);
		return `${getUrl()}/family/invite/email?token=${token}`;
	}
};

/** Returns `ctx` with every cross-module adapter attached. */
export function wirePorts<C extends Ctx>(ctx: C): C & AppPorts {
	return {
		...ctx,
		calendarAccess: createCalendarAccessPort(ctx),
		adConsent: sponsoredAdConsentPort(ctx),
		calendar: createFamilyCalendarPort(),
		tasks: { unassignMemberTasks },
		moduleSwitches: dashboardModuleSwitches,
		childAccount,
		inviteLink: legacyInviteLink
	};
}
