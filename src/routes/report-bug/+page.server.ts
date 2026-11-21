import { reportBugPageLoad, submitBugReportAction } from '$lib/domains/feedback/index.server';

export const load = reportBugPageLoad;
export const actions = { submit: submitBugReportAction };
