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
 * TRANSITION BRIDGES (K-15; each names the module whose S5 replaces it):
 * identity's `adConsent` port is backed by the legacy functions until
 * `sponsored` ports, because identity's S5+S6 ran before calendar's and
 * sponsored's:
 * - `adConsent` → legacy `getAdConsentRecords`/`recordAdConsentChange`
 *   (services/adConsentService). `sponsored`'s S5 exports the real adapter.
 *   It must keep reading today's rows so the frozen identity goldens see the
 *   consent records another module owns.
 *
 * Calendar already ports, so its two adapters are the REAL ones from
 * `$lib/domains/calendar/index.server`:
 * - identity's `calendarAccess` → `createCalendarAccessPort(ctx)`, one home for
 *   the accessible-calendar scope read (`listAccessibleCalendarIds`).
 * - family's `calendar.createFamilyCalendar` → `createFamilyCalendarPort()`,
 *   which writes through the ctx family hands it, so the row joins family's
 *   create transaction.
 *
 * family's remaining ports are bridged, because family's S5+S6 ran before
 * tasks' (the third is owner answer Q-030, a family-owned port, implemented by
 * dashboardModules):
 * - `tasks.unassignMemberTasks` → legacy `removeFamilyMember`, which also drops
 *   the roster row, so family calls it BEFORE its own delete. `tasks`' S5
 *   exports the assignment clear alone and family's delete does the row.
 * - `moduleSwitches.listFamilyModuleSwitches` → dashboardModules' exported
 *   `listFamilyModuleSwitches` (Q-030; no longer a bridge).
 * - `childAccount.createChildAccount` → legacy `createNewUser`, the one helper
 *   that writes the child's `users` row, `email` account, settings and personal
 *   calendar. Identity's S5 has no such use-case and `calendars` belongs to
 *   calendar, so both owning modules must export one before this bridge goes.
 * - `inviteLink.mintInviteLink` → `oslo/jwt` with `EMAILSECRET` plus the legacy
 *   `getUrl()`: the legacy invite page still validates the token with that
 *   secret, and only `app` may read the environment (R6). A kernel token port
 *   would be the real home; it does not exist yet.
 *
 * dashboardModules' Q-030 adapter is the exception: it is not a bridge, because
 * `family` declares that port for a HIGHER-ranked module (`dashboardModules`
 * implements it). This module's other family need, the viewer's role, is a
 * direct call (family is rank 4).
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
import type {
	FamilyChildAccountPort,
	FamilyInviteLinkPort,
	FamilyModuleSwitchesPort,
	FamilyPorts,
	MemberTasksPort
} from '$lib/domains/family/index.server';
import { listFamilyModuleSwitches } from '$lib/domains/dashboardModules/index.server';
import type { AdConsentPort, IdentityPorts } from '$lib/domains/identity/index.server';
import { removeFamilyMember } from '$lib/server/db/actions/families';
import { getAdConsentRecords, recordAdConsentChange } from '$lib/server/services/adConsentService';
import { createNewUser } from '$lib/server/utils/createNewUser';
import { getUrl } from '$lib/utils/getUrl';

/** Cross-module adapters. Grows one owning module at a time. */
export type AppPorts = IdentityPorts & FamilyPorts;

/** `EMAILSECRET` signed the legacy invite tokens; the legacy invite page still validates with it. */
const INVITE_TOKEN_SECRET = new TextEncoder().encode(process.env.EMAILSECRET ?? '');

/** One day, as both legacy invite doors minted. */
const INVITE_TOKEN_LIFETIME = new TimeSpan(1, 'd');

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

/** TRANSITION BRIDGE — `tasks`' S5 replaces this with the assignment clear alone. */
const legacyMemberTasks: MemberTasksPort = {
	unassignMemberTasks: async (_ctx, familyId, userId) => {
		await removeFamilyMember(familyId, userId);
	}
};

/** Q-030: dashboardModules' S5 exports the real family-switch read. */
const dashboardModuleSwitches: FamilyModuleSwitchesPort = {
	listFamilyModuleSwitches: async (ctx, familyId) => listFamilyModuleSwitches(ctx, familyId)
};

/** TRANSITION BRIDGE — identity's + calendar's S5 replace this with one account use-case. */
const legacyChildAccount: FamilyChildAccountPort = {
	createChildAccount: async (_ctx, input) => {
		const user = await createNewUser(input.firstName, input.lastName, input.email);
		return {
			id: user.id,
			firstName: user.firstName,
			lastName: user.lastName,
			email: user.email
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
		adConsent: legacyAdConsent,
		calendar: createFamilyCalendarPort(),
		tasks: legacyMemberTasks,
		moduleSwitches: dashboardModuleSwitches,
		childAccount: legacyChildAccount,
		inviteLink: legacyInviteLink
	};
}
