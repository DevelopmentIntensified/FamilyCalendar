/**
 * familyHub — public isomorphic interface: the two page models and the `/api`
 * body type.
 *
 * Other modules import familyHub ONLY through this file, index.server.ts or
 * ui/index.ts (rule R2).
 *
 * Doc: ./README.md#public-interface
 */

/** The detail page's one typed model: family, roster, viewer role, activity, module rows, live invite, plan usage. */
export type {
	FamilyHubModel,
	FamilyHubMember,
	FamilyHubActivityItem,
	FamilyHubInvite,
	FamilyHubPlanUsage
} from './familyHub.contract';

/** The board page's model: chosen family, viewer, tasks, Public Tasks, roster, categories and the completed-window count. */
export type { FamilyBoardModel, FamilyBoardTask } from './familyHub.contract';

/** The wire body of `GET /api/families/{id}/tasks` (G11), exactly four keys. */
export type { FamilyBoardResponse } from './familyHub.contract';
