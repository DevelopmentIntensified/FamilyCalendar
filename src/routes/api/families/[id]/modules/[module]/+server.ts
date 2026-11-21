import { putFamilyModuleSwitchEndpoint } from '$lib/domains/dashboardModules/index.server';

/** `PUT /api/families/{id}/modules/{module}` — wiring only (rule R8). */
export const PUT = putFamilyModuleSwitchEndpoint.handler;
