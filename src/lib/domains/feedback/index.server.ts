/**
 * feedback — public server interface: services, `/api` handlers and the
 * `/report-bug` page handlers.
 * Doc: ./README.md#public-interface
 */
export {
	submitBugReportEndpoint,
	reportUnmatchedPhraseEndpoint,
	listBugReportsEndpoint,
	listUnmatchedPhrasesEndpoint,
	resolveBugReportEndpoint,
	resolveUnmatchedPhraseEndpoint,
	reportBugPageLoad,
	submitBugReportAction
} from './feedback.http.server';
export {
	countOpenFeedback,
	fileAutoBugReport,
	fileBugReport,
	listFeedback,
	pruneFeedbackOlderThan,
	reportUnmatchedPhrase,
	resolveFeedback
} from './feedback.service.server';
export type {
	FeedbackBugRegister,
	FeedbackPhraseRegister
} from './feedback.service.server';
