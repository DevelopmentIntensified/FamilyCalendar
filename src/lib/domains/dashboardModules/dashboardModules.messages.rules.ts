/**
 * dashboardModules messages: every sentence the two `/api` routes, the service
 * and the contract answer with, in one home.
 *
 * They live outside `dashboardModules.contract.ts` because a module entry is
 * loaded whole: `familyHub`'s detail state imports this module's row helpers
 * through the entry, and the entry's contract re-export shipped the schema
 * library to the family hub page for copy alone (ADR 0010). The contract
 * imports these same names, so there is still one home per sentence.
 *
 * Doc: ./README.md#invariants
 */
import { DASHBOARD_MODULES } from './dashboardModules.registry.rules';

/** The one 400 body `PUT /api/families/{id}/modules/{module}` uses for a non-boolean. */
export const FAMILY_MODULE_ENABLED_MESSAGE = 'enabled must be a boolean';

/** The one 400 body `PUT /api/me/dashboard-modules` uses for a malformed list. */
export const MY_MODULES_HIDDEN_MESSAGE = 'hidden must be an array of module ids';

/** The 403 a family switch answers a plain member or a stranger (`familyData.ts:258-268`). */
export const FAMILY_MODULE_FORBIDDEN_MESSAGE = 'You do not have permission to perform this action';

/** An empty `{module}` is refused before the registry is consulted (`familyData.ts:361`). */
export const FAMILY_MODULE_REQUIRED_MESSAGE = 'Module is required';

/** An id the registry does not know (`db/actions/dashboardModules.ts:30`). */
export function familyModuleUnknownMessage(module: string): string {
	return `Unknown dashboard module: ${module}`;
}

/** A registry id with a personal scope: it has no family master switch (`db/actions/dashboardModules.ts:32-34`). */
export function familyModuleNotFamilyScopedMessage(module: string): string {
	return `Module is not family-scoped: ${module}`;
}

/**
 * The per-user save's `message`: the count of cards still on, out of the
 * canonical registry. Wire copy, so it has one home here rather than in the
 * service that composes the response.
 */
export function dashboardModulesSavedMessage(hiddenCount: number): string {
	return hiddenCount
		? `Dashboard modules saved — ${DASHBOARD_MODULES.length - hiddenCount} of ${DASHBOARD_MODULES.length} cards on.`
		: `Dashboard modules saved — all ${DASHBOARD_MODULES.length} cards on.`;
}
