/**
 * dashboardModules api: the browser client for this module's two `/api`
 * endpoints, on the kernel api client (K-07). Returns `ApiResult`, so the
 * calling screen rolls back and toasts instead of catching.
 *
 * The only callers are the `account` screen (the per-user hidden list) and the
 * `familyHub` screen (a family master switch); both reach this through the
 * public entries (`index.ts`), never a raw `fetch`. The bodies and answers are
 * the contract's schemas, so the browser and the route cannot drift.
 *
 * Doc: ./README.md#public-interface
 */
import { createApiClient, type ApiClient, type ApiResult } from '$lib/kernel/client/apiClient';
import type {
	FamilyModuleSwitchResponse,
	MyDashboardModulesResponse
} from './dashboardModules.contract';

/** The two calls a Dashboard Module switch saves. */
export interface DashboardModulesApi {
	/** `PUT /api/families/{id}/modules/{module}` — a family master switch. */
	setFamilyModuleSwitch(
		familyId: string,
		module: string,
		enabled: boolean
	): Promise<ApiResult<FamilyModuleSwitchResponse>>;
	/** `PUT /api/me/dashboard-modules` — the viewer's own hidden list. */
	saveHiddenModules(hidden: readonly string[]): Promise<ApiResult<MyDashboardModulesResponse>>;
}

export function createDashboardModulesApi(client: ApiClient = createApiClient()): DashboardModulesApi {
	return {
		setFamilyModuleSwitch(familyId, module, enabled) {
			return client.request(
				'PUT',
				`/api/families/${encodeURIComponent(familyId)}/modules/${encodeURIComponent(module)}`,
				{ enabled }
			);
		},
		saveHiddenModules(hidden) {
			return client.request('PUT', '/api/me/dashboard-modules', { hidden });
		}
	};
}
