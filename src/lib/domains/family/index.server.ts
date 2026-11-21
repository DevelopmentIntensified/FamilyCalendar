/**
 * family — public server interface: the services, the `/api` handlers, the
 * page loads, and the five ports this module declares.
 *
 * Family is rank 4, so it may call `billing`, `identity` and `alerts` directly
 * through their entries, but it cannot call the modules that own the rows it
 * needs written elsewhere. Each such need is a port declared here and wired in
 * `src/lib/app/ports.server.ts`:
 * - `FamilyCalendarPort.createFamilyCalendar` — `calendar` (rank 8) inserts the
 *   family mirror row inside the family-create transaction.
 * - `MemberTasksPort.unassignMemberTasks` — `tasks` (rank 9) clears a removed
 *   member's Family Task assignments inside the removal transaction.
 * - `FamilyModuleSwitchesPort.listFamilyModuleSwitches` — `dashboardModules`
 *   (rank 5) answers the four family-scoped master switches the detail payload
 *   carries (Q-030; no rank exception and no module cycle).
 * - `FamilyChildAccountPort.createChildAccount` — the child door's real,
 *   passwordless account: the `users`/`accounts`/`userSettings` rows belong to
 *   `identity` and the personal calendar to `calendar`. Identity's S5 exports
 *   no such use-case yet, so the adapter is a transition bridge.
 * - `FamilyInviteLinkPort.mintInviteLink` — the signed, code-bound join URL
 *   (#152) the emailed invite and the shareable link carry. It needs
 *   `EMAILSECRET` and the site URL, which only `app` may read (R6).
 *
 * Doc: ./README.md#public-interface
 */
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import type { IdentityPorts } from '$lib/domains/identity/index.server';

// --- Ports this module declares ---------------------------------------------

/** Implemented by `calendar`: the family mirror row a new family gets. */
export type FamilyCalendarPort = {
	/** Insert the family's `calendars` row inside the caller's transaction. */
	createFamilyCalendar(ctx: Ctx, familyId: string): Promise<void>;
};

/** Implemented by `tasks`: clearing a removed member's Family Task assignments. */
export type MemberTasksPort = {
	/** Set `assignedTo = null` and `assignmentStatus = 'none'` for that member's family tasks. */
	unassignMemberTasks(ctx: Ctx, familyId: string, userId: string): Promise<void>;
};

/**
 * Implemented by `dashboardModules` (owner answer Q-030, 2026-11-20): the
 * family-scoped master switches, default-on when no row exists.
 */
export type FamilyModuleSwitchesPort = {
	listFamilyModuleSwitches(
		ctx: Ctx,
		familyId: string
	): Promise<Readonly<Record<string, boolean>>>;
};

/** The child's own account as the create door writes it. */
export type FamilyChildAccountInput = {
	readonly firstName: string;
	readonly lastName: string;
	readonly email: string;
};

/** The `users` row the child door answers with. */
export type FamilyChildAccountView = {
	readonly id: string;
	readonly firstName: string;
	readonly lastName: string;
	readonly email: string | null;
};

/** Implemented by `identity` (+ `calendar` for the personal calendar): a child's real account. */
export type FamilyChildAccountPort = {
	createChildAccount(ctx: Ctx, input: FamilyChildAccountInput): Promise<FamilyChildAccountView>;
};

/** What a join link carries: the invite target and the durable code row it binds (#152). */
export type FamilyInviteLinkInput = {
	readonly email: string;
	readonly firstName: string;
	readonly lastName: string;
	readonly familyId: string;
	readonly inviteCode: string;
};

/** Implemented by `app`: signs the join token and builds the site URL. */
export type FamilyInviteLinkPort = {
	mintInviteLink(input: FamilyInviteLinkInput): Promise<string>;
};

/** The ports family's services read off the ctx. */
export type FamilyPorts = {
	readonly calendar: FamilyCalendarPort;
	readonly tasks: MemberTasksPort;
	readonly moduleSwitches: FamilyModuleSwitchesPort;
	readonly childAccount: FamilyChildAccountPort;
	readonly inviteLink: FamilyInviteLinkPort;
};

/** The ctx the services that cross a module boundary take. */
export type FamilyCtx = Ctx & FamilyPorts;

/**
 * `getFamily` also reads the viewer's hidden Dashboard Modules through
 * identity's settings service, which needs identity's own two ports attached.
 */
export type FamilyDetailCtx = FamilyCtx & IdentityPorts;

// --- Services -----------------------------------------------------------------

export {
	createFamily,
	getFamily,
	listFamilies,
	updateFamily,
	type FamilyListPayload
} from './family.families.service.server';
export {
	addChildMember,
	addMemberDirectly,
	changeMember,
	mintFamilyInviteLink,
	removeFamilyMember,
	sendFamilyInvite,
	type ChildAddInput,
	type DirectAddInput,
	type InviteTargetInput,
	type MemberChangeInput,
	type MemberRemovalInput
} from './family.members.service.server';
export {
	joinFamily,
	listInvites,
	mintInvite,
	previewInvite,
	revokeInvite
} from './family.invites.service.server';
export {
	findInvitableMembers,
	listFamilyRoster,
	searchMembers
} from './family.search.service.server';

// --- HTTP handlers ------------------------------------------------------------

export {
	addChildEndpoint,
	addDirectEndpoint,
	changeMemberEndpoint,
	createFamilyEndpoint,
	getFamilyEndpoint,
	joinFamilyEndpoint,
	listFamiliesEndpoint,
	listInviteCodesEndpoint,
	memberSearchEndpoint,
	mintInviteEndpoint,
	mintInviteLinkEndpoint,
	previewInviteEndpoint,
	removeMemberEndpoint,
	revokeInviteEndpoint,
	rosterEndpoint,
	searchFamilyEndpoint,
	sendInviteEmailEndpoint,
	updateFamilyEndpoint
} from './family.http.server';
