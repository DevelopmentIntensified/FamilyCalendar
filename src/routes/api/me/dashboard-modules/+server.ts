import { putMyDashboardModulesEndpoint } from '$lib/domains/dashboardModules/index.server';

/** `PUT /api/me/dashboard-modules` — wiring only (rule R8). */
export const PUT = putMyDashboardModulesEndpoint.handler;
