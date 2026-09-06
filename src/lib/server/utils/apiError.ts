import { json } from '@sveltejs/kit';
import { buildAutoBugReport, shouldFileAutoReport } from '$lib/server/services/autoBugReport';
import { createBugReport, type NewBugReport } from '$lib/server/db/actions/bugReports';
import type { BugReport } from '$lib/server/db/schema';

/**
 * Dependency seam for the auto-filer: production files via `createBugReport`;
 * tests inject a spy so no DB write ever happens off a mocked module.
 */
export type AutoReportFiler = (report: NewBugReport) => Promise<BugReport | null>;

/**
 * JSON error response that also auto-files a bug report for server faults.
 * SvelteKit handleError never sees deliberate API `return`s, so API 500s
 * silently skipped auto-collection — this mirrors the handleError filing
 * sequence (build + throttle + file). Filing is throttled and
 * fire-and-forget so it can't break or slow the error response itself.
 * Only 5xx responses file; 4xx are expected client errors.
 */
export function apiError(
	path: string,
	status: number,
	message: string,
	userId: string | null = null,
	fileReport: AutoReportFiler = createBugReport
) {
	if (status >= 500) {
		try {
			const report = buildAutoBugReport({ status, message, path, userId });
			if (report && shouldFileAutoReport(`${report.area}:${path}:${message.slice(0, 120)}`)) {
				void fileReport(report).catch(() => {});
			}
		} catch {
			// Auto-filing is best-effort by design.
		}
	}
	return json({ error: message }, { status });
}
