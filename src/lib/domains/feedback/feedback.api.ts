/**
 * feedback api: the browser client for this module's endpoints, on the kernel
 * api client (K-07). Returns `ApiResult`, so a state class rolls back and
 * toasts instead of catching.
 *
 * Only two callers exist: the parsers' "couldn't parse this" button posts a
 * phrase, and the admin register resolves a row. Both go through the public
 * entries (`index.ts`), which is why this file exports the factory and the
 * two narrow shapes the state classes need — never a raw `fetch`.
 *
 * Doc: ./README.md#public-interface
 */
import { createApiClient, type ApiResult } from '$lib/kernel/client/apiClient';
import type {
	BugReportResolvedResponse,
	BugReportsRegisterResponse,
	PhraseReportedResponse,
	UnmatchedPhraseBody,
	UnmatchedPhraseResolvedResponse,
	UnmatchedPhrasesRegisterResponse
} from './feedback.contract';

export function createFeedbackApi(client = createApiClient()) {
	return {
		/** `POST /api/report-phrase`: record a phrase a parser could not match. */
		reportPhrase(body: UnmatchedPhraseBody): Promise<ApiResult<PhraseReportedResponse>> {
			return client.request('POST', '/api/report-phrase', body);
		},
		/** `GET /api/admin/bugs`: the bug register plus its open-only export text. */
		listBugReports(): Promise<ApiResult<BugReportsRegisterResponse>> {
			return client.request('GET', '/api/admin/bugs');
		},
		/** `GET /api/admin/nlp`: the phrase register plus its open-only export text. */
		listUnmatchedPhrases(): Promise<ApiResult<UnmatchedPhrasesRegisterResponse>> {
			return client.request('GET', '/api/admin/nlp');
		},
		/** `POST /api/admin/bugs/[id]/resolve`. */
		resolveBugReport(id: string): Promise<ApiResult<BugReportResolvedResponse>> {
			return client.request('POST', `/api/admin/bugs/${encodeURIComponent(id)}/resolve`);
		},
		/** `POST /api/admin/nlp/[id]/resolve`. */
		resolveUnmatchedPhrase(id: string): Promise<ApiResult<UnmatchedPhraseResolvedResponse>> {
			return client.request('POST', `/api/admin/nlp/${encodeURIComponent(id)}/resolve`);
		}
	};
}

export type FeedbackApi = ReturnType<typeof createFeedbackApi>;

/** What a resolve answers, as far as the register state cares: ok, or the refusal copy. */
export type FeedbackResolveResult =
	| { readonly ok: true }
	| { readonly ok: false; readonly status: number; readonly error: string };

/** What the two register state classes need: each kind's resolve call. */
export type FeedbackRegisterApi = {
	resolveBugReport(id: string): Promise<FeedbackResolveResult>;
	resolveUnmatchedPhrase(id: string): Promise<FeedbackResolveResult>;
};
