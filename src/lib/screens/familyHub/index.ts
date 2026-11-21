/**
 * familyHub — public isomorphic interface: contract types, pure rules, client api.
 * Other modules import familyHub ONLY through this file, index.server.ts or ui/index.ts (rule R2).
 * Doc: ./README.md#public-interface
 */

/** The wire body of `GET /api/families/{id}/tasks` (G11), exactly four keys. */
export type { FamilyBoardResponse } from './familyHub.contract';
