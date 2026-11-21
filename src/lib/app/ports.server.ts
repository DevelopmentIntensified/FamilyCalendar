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
 *
 * TRANSITION BRIDGES (K-15) left, all family's: family's S5+S6 ran before
 * tasks' and dashboardModules' (the third is owner answer Q-030, a
 * family-owned port):
 * - `tasks.unassignMemberTasks` → legacy `removeFamilyMember`, which also drops
 *   the roster row, so family calls it BEFORE its own delete. `tasks`' S5
 *   exports the assignment clear alone and family's delete does the row.
 * - `moduleSwitches.listFamilyModuleSwitches` → legacy
 *   `getFamilyModuleSwitches` (dashboardModules has no S5 yet, and its entry
 *   exports no `listFamilyModuleSwitches`; the ask is in the report).
 * - `childAccount.createChildAccount` → legacy `createNewUser`, the one helper
 *   that writes the child's `users` row, `email` account, settings and personal
 *   calendar. Identity's S5 has no such use-case and `calendars` belongs to
 *   calendar, so both owning modules must export one before this bridge goes.
 * - `inviteLink.mintInviteLink` → `oslo/jwt` with `EMAILSECRET` plus the legacy
 *   `getUrl()`: the legacy invite page still validates the token with that
 *   secret, and only `app` may read the environment (R6). A kernel token port
 *   would be the real home; it does not exist yet.
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
import type { IdentityPorts } from '$lib/domains/identity/index.server';
import { sponsoredAdConsentPort } from '$lib/domains/sponsored/index.server';
import { getFamilyModuleSwitches } from '$lib/server/db/actions/dashboardModules';
import { removeFamilyMember } from '$lib/server/db/actions/families';
import { createNewUser } from '$lib/server/utils/createNewUser';
import { getUrl } from '$lib/utils/getUrl';

/** Cross-module adapters. Grows one owning module at a time. */
export type AppPorts = IdentityPorts & FamilyPorts;

/** `EMAILSECRET` signed the legacy invite tokens; the legacy invite page still validates with it. */
const INVITE_TOKEN_SECRET = new TextEncoder().encode(process.env.EMAILSECRET ?? '');

/** One day, as both legacy invite doors minted. */
const INVITE_TOKEN_LIFETIME = new TimeSpan(1, 'd');

/** TRANSITION BRIDGE — `tasks`' S5 replaces this with the assignment clear alone. */
const legacyMemberTasks: MemberTasksPort = {
	unassignMemberTasks: async (_ctx, familyId, userId) => {
		await removeFamilyMember(familyId, userId);
	}
};

/** TRANSITION BRIDGE — `dashboardModules`' S5 exports `listFamilyModuleSwitches` (Q-030). */
const legacyModuleSwitches: FamilyModuleSwitchesPort = {
	listFamilyModuleSwitches: async (_ctx, familyId) => getFamilyModuleSwitches(familyId)
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
		adConsent: sponsoredAdConsentPort(ctx),
		calendar: createFamilyCalendarPort(),
		tasks: legacyMemberTasks,
		moduleSwitches: legacyModuleSwitches,
		childAccount: legacyChildAccount,
		inviteLink: legacyInviteLink
	};
}
