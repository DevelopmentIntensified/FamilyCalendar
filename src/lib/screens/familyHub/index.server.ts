/**
 * familyHub — public server interface: the page loads, the detail page's
 * actions, the board endpoint and the legacy-path redirect.
 *
 * Doc: ./README.md#public-interface
 */
export {
	familyBoardEndpoint,
	familyBoardPageLoad,
	familyHubActions,
	familyHubPageLoad,
	familyHubRemoveMemberAction,
	familyHubSetMemberTypeAction,
	familyHubToggleModuleAction,
	familyHubUpdateFamilyAction,
	familyHubUpdateRoleAction,
	legacyFamilyBoardPathLoad,
	FAMILY_BOARD_COMPLETED_LIMIT
} from './familyHub.http.server';
export {
	getFamilyBoard,
	getFamilyHub,
	type FamilyBoardInput,
	type FamilyHubCtx,
	type FamilyHubInput
} from './familyHub.service.server';
