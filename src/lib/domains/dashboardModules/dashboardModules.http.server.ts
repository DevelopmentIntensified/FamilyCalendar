/**
 * dashboardModules http: the two `/api` PUT handlers over the module's services.
 *
 * One file, because the S2 golden `dashboardModules.http.db.test.ts` is the
 * module's contract test and rule R13 ties a test to the file with the same
 * stem — the shape every other ported module uses.
 *
 * Reproduces the legacy wire exactly: auth mode (`user` on both), statuses,
 * bodies and copy; neither route is rate limited today. Bodies and params are
 * the contract's schemas, so a non-object body is `Invalid JSON` and each field
 * keeps its own sentence. No SQL and no rules — the services own both.
 *
 * Doc: ./README.md#public-interface
 */
import { endpoint, ok } from '$lib/kernel/http/endpoint.server';
import {
	FamilyModuleParams,
	FamilyModuleSwitchBody,
	type FamilyModuleSwitchResponse,
	MyDashboardModulesBody,
	type MyDashboardModulesResponse
} from './dashboardModules.contract';
import { saveHiddenModules, setFamilyModuleSwitch } from './dashboardModules.service.server';

/** The legacy 500 body when the settings write failed (`accountData.ts:255-257`). */
const MY_MODULES_FAIL_MESSAGE = 'Failed to save dashboard modules';

/**
 * `PUT /api/families/{id}/modules/{module}` `{enabled:boolean}` (#292 G10b) —
 * a family Dashboard Module master switch. Creator/admin only; a row exists
 * only while OFF.
 */
export const putFamilyModuleSwitchEndpoint = endpoint({
	auth: 'user',
	params: FamilyModuleParams,
	body: FamilyModuleSwitchBody,
	handle: async ({ ctx, actor, params, body }) => {
		await setFamilyModuleSwitch(ctx, actor, {
			familyId: params.id,
			module: params.module,
			enabled: body.enabled
		});
		const response: FamilyModuleSwitchResponse = { success: true };
		return ok(response);
	}
});

/**
 * `PUT /api/me/dashboard-modules` `{hidden: string[]}` (#292 G14) — your own
 * hidden Dashboard Modules. Only canonical ids are stored; unknown ids are
 * dropped and still answer `200` (Q-029).
 */
export const putMyDashboardModulesEndpoint = endpoint({
	auth: 'user',
	body: MyDashboardModulesBody,
	failMessage: MY_MODULES_FAIL_MESSAGE,
	handle: async ({ ctx, actor, body }) => {
		const saved = await saveHiddenModules(ctx, actor, { hidden: body.hidden });
		const response: MyDashboardModulesResponse = {
			success: true,
			message: saved.message,
			hidden: [...saved.hidden]
		};
		return ok(response);
	}
});
