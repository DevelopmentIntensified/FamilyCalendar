import {
	adminBugRegisterPageLoad,
	adminResolveBugReportAction
} from '$lib/screens/admin/index.server';

export const load = adminBugRegisterPageLoad;
export const actions = { resolve: adminResolveBugReportAction };
