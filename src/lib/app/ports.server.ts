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
 * identity's two ports are backed by the legacy functions until their owning
 * modules port, because identity's S5+S6 ran before calendar's and sponsored's:
 * - `calendarAccess` → legacy `getAccessibleCalendarIds` (db/actions/calendarScope).
 *   `calendar`'s S5 exports the real adapter and replaces this block.
 * - `adConsent` → legacy `getAdConsentRecords`/`recordAdConsentChange`
 *   (services/adConsentService). `sponsored`'s S5 exports the real adapter.
 * Both must keep reading today's rows so the frozen identity goldens see the
 * calendars and consent records another module owns.
 *
 * family's five ports are bridged the same way, because family's S5+S6 ran
 * before calendar's, tasks' and dashboardModules' (the third is owner answer
 * Q-030, a family-owned port):
 * - `calendar.createFamilyCalendar` → legacy `createCalendar({ familyId })`.
 *   `calendar`'s S5 exports the real adapter and replaces it. The bridge cannot
 *   join family's transaction, so family calls it right after its own commit;
 *   the S5 adapter moves the insert back inside `withTx`.
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
import type {
	FamilyChildAccountPort,
	FamilyCalendarPort,
	FamilyInviteLinkPort,
	FamilyModuleSwitchesPort,
	FamilyPorts,
	MemberTasksPort
} from '$lib/domains/family/index.server';
import type {
	AdConsentPort,
	CalendarAccessPort,
	IdentityPorts
} from '$lib/domains/identity/index.server';
import { createCalendar } from '$lib/server/db/actions/calendar';
import { getAccessibleCalendarIds } from '$lib/server/db/actions/calendarScope';
import { getFamilyModuleSwitches } from '$lib/server/db/actions/dashboardModules';
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

/** TRANSITION BRIDGE — `calendar`'s S5 replaces this with its exported adapter. */
const legacyFamilyCalendar: FamilyCalendarPort = {
	createFamilyCalendar: async (_ctx, familyId) => {
		await createCalendar({ familyId });
	}
};

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
		calendarAccess: legacyCalendarAccess,
		adConsent: legacyAdConsent,
		calendar: legacyFamilyCalendar,
		tasks: legacyMemberTasks,
		moduleSwitches: legacyModuleSwitches,
		childAccount: legacyChildAccount,
		inviteLink: legacyInviteLink
	};
}
