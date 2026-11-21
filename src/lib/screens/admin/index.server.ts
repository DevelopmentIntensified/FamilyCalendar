/**
 * admin — public server interface: services and http handlers.
 * Doc: ./README.md#public-interface
 */
export {
	adminBugRegisterPageLoad,
	adminCountsEndpoint,
	adminLayoutLoad,
	adminPhraseRegisterPageLoad,
	adminResolveBugReportAction,
	adminResolveUnmatchedPhraseAction
} from './admin.http.server';
export { getAdminCounts } from './admin.service.server';
