/**
 * dashboardModules — public server interface: the services and the two `/api`
 * handlers.
 *
 * `getDashboardVisibility` reaches identity's settings row through identity's
 * own service, which takes identity's two ports attached (`IdentityPorts`). The
 * family role the switch service checks comes from family's own `getViewerRole`:
 * family is rank 4, so this module imports it directly and declares no port.
 *
 * Doc: ./README.md#public-interface
 */
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import type { IdentityPorts } from '$lib/domains/identity/index.server';

/** `getDashboardVisibility` reads the viewer's settings through identity's service. */
export type DashboardModulesVisibilityCtx = Ctx & IdentityPorts;

// --- Services -----------------------------------------------------------------

export {
	getDashboardVisibility,
	listFamilyModuleSwitches,
	saveHiddenModules,
	setFamilyModuleSwitch,
	type DashboardVisibilityInput,
	type FamilyModuleSwitchInput,
	type HiddenModulesInput,
	type HiddenModulesResult
} from './dashboardModules.service.server';

// --- HTTP handlers ------------------------------------------------------------

export {
	putFamilyModuleSwitchEndpoint,
	putMyDashboardModulesEndpoint
} from './dashboardModules.http.server';
