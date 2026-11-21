import {
	familyHubPageLoad,
	familyHubRemoveMemberAction,
	familyHubSetMemberTypeAction,
	familyHubToggleModuleAction,
	familyHubUpdateFamilyAction,
	familyHubUpdateRoleAction
} from '$lib/screens/familyHub/index.server';

/**
 * `/family/[familyId]` — wiring only (rule R8). The load, its 404 parity and
 * the five member/settings actions live in `familyHub`; the actions object
 * names each imported handler so the auth audit resolves all five.
 */
export const load = familyHubPageLoad;
export const actions = {
	removeMember: familyHubRemoveMemberAction,
	updateRole: familyHubUpdateRoleAction,
	setMemberType: familyHubSetMemberTypeAction,
	updateFamily: familyHubUpdateFamilyAction,
	toggleDashboardModule: familyHubToggleModuleAction
};
