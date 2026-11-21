/**
 * family — public isomorphic interface: contract types, pure rules, client api
 * and the page state classes.
 *
 * Other modules import family ONLY through this file, index.server.ts or
 * ui/index.ts (rule R2). The server side (services, endpoints, page handlers)
 * lives in `index.server.ts`.
 *
 * Doc: ./README.md#public-interface
 */
export { createFamilyApi, type FamilyApi } from './family.api';
export type {
	FamilyAddMemberPage,
	FamilyActiveInvite,
	FamilyCreateFormEcho,
	FamilyCreatePage,
	FamilyInvitationsPage,
	FamilyJoinPage,
	FamilyListPayload
} from './family.contract';
export { FamilyAddMemberState } from './family.addMember.state.svelte';
export { FamilyCreateState, familyCreateConfirmed } from './family.create.state.svelte';
export { FamilyHomeState } from './family.home.state.svelte';
export { FamilyInvitationsState } from './family.invitations.state.svelte';
export { FamilyJoinState } from './family.join.state.svelte';
export { familyDraft, familyPatch } from './family.families.rules';
export { canRemove, canEditRole, memberDisplayName, rolePillClass } from './family.display.rules';
export { FAMILY_PALETTE, DEFAULT_FAMILY_COLOR, isFamilyColor } from './family.palette.rules';
export { DEFAULT_INVITE_MAX_USES, isInviteUsable } from './family.invites.rules';
export {
	canManageInvites,
	canManageMembers,
	isFamilyRole,
	isMemberType
} from './family.roles.rules';
