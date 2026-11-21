/**
 * feedback http: the six `/api` handlers over the services, plus the
 * `/report-bug` page's load and submit action.
 *
 * Reproduces the legacy wire exactly: auth mode, rate-limit scope (the same
 * `${scope}:${ip}` keys legacy used), statuses, bodies and error copy. No SQL
 * and no rules — the services own both.
 *
 * Export timestamps are built with `toInstantString` (`kernel/time`), so the
 * handler's static body type is the wire type while the goldens still see ISO
 * strings. The export text takes `now = ctx.clock.now()` and the `'UTC'` zone,
 * the server-local zone production ran in (see the sheet's Notes); S7's
 * client-side recompute must pass the same pair.
 *
 * Doc: ./README.md#public-interface
 */
import { fail } from '@sveltejs/kit';
import type { BugReportRow, UnmatchedPhraseRow } from '$lib/kernel/db/tables.server';
import { isAppError } from '$lib/kernel/errors/appError';
import { endpoint, ok, reply } from '$lib/kernel/http/endpoint.server';
import { formAction, pageLoad } from '$lib/kernel/http/pageHandlers.server';
import { toInstantString } from '$lib/kernel/time/dates';
import { firstIssueMessage } from '$lib/kernel/validation/validators';
import {
	BugReportBody,
	BugReportFormBody,
	FeedbackResolveParams,
	UnmatchedPhraseBody,
	type BugReportFiledResponse,
	type BugReportResponse,
	type BugReportResolvedResponse,
	type BugReportWithReporter,
	type BugReportWithReporterResponse,
	type BugReportsRegisterResponse,
	type PhraseReportedResponse,
	type UnmatchedPhraseResolvedResponse,
	type UnmatchedPhraseResponse,
	type UnmatchedPhraseView,
	type UnmatchedPhrasesRegisterResponse
} from './feedback.contract';
import { formatBugReportsExport, formatUnmatchedPhrasesExport } from './feedback.export.rules';
import { safeReportedPath } from '$lib/kernel/ui/bugReportLink';
import { BUG_AREAS } from './feedback.rules';
import {
	fileBugReport,
	listFeedback,
	reportUnmatchedPhrase,
	resolveFeedback
} from './feedback.service.server';

/** The zone both registers' export text is stamped in (legacy: server local, UTC). */
const EXPORT_ZONE = 'UTC';

/** The `/report-bug` write-failure copy (legacy `fail(500, …)` after a null row). */
const BUG_REPORT_SAVE_FAILED = 'Could not save your report. Please try again.';

/** The `/api/bug-report` write-failure copy (legacy `apiError`'s 500 message). */
const BUG_REPORT_API_FAILED = 'Could not save report. Please try again.';

/** A required wire timestamp. A stored `Date` is always valid; otherwise it is a fault. */
function instant(value: Date): string {
	const text = toInstantString(value);
	if (text === null) throw new Error('feedback http: invalid timestamp');
	return text;
}

/** The three instants every report row carries, as the wire's ISO strings. */
function reportInstants(row: BugReportRow | BugReportWithReporter) {
	return {
		resolvedAt: row.resolvedAt === null ? null : instant(row.resolvedAt),
		createdAt: instant(row.createdAt),
		updatedAt: instant(row.updatedAt)
	};
}

function bugReportWire(row: BugReportRow): BugReportResponse {
	return { ...row, ...reportInstants(row) };
}

function bugReportWithReporterWire(row: BugReportWithReporter): BugReportWithReporterResponse {
	return { ...row, ...reportInstants(row) };
}

function unmatchedPhraseWire(row: UnmatchedPhraseView): UnmatchedPhraseResponse {
	return { ...row, createdAt: instant(row.createdAt), updatedAt: instant(row.updatedAt) };
}

/**
 * `POST /api/bug-report`: signed in, 5 reports per 5 minutes per IP, then the
 * legacy body. `bodyMode: 'lenient'` because the golden pins the route's own
 * sentence for a malformed or non-object body, which the contract repeats.
 */
export const submitBugReportEndpoint = endpoint({
	auth: 'user',
	rateLimit: {
		scope: 'bug-report',
		limit: 5,
		windowMs: 5 * 60 * 1000,
		message: 'Too many reports. Try again shortly.'
	},
	body: BugReportBody,
	bodyMode: 'lenient',
	failMessage: BUG_REPORT_API_FAILED,
	handle: async ({ ctx, actor, body, event }) => {
		try {
			const filed = await fileBugReport(ctx, actor, body);
			const response: BugReportFiledResponse = { success: true, id: filed.id };
			return ok(response);
		} catch (cause) {
			if (isAppError(cause)) throw cause;
			// Legacy `apiError` filed its fixed copy for a failed write, never the
			// driver text: the admin register and its agent export must not carry
			// SQL, connection strings or a person's data (F3 security review).
			ctx.log.error('bug_report_failed', {
				message: cause instanceof Error ? cause.message : String(cause)
			});
			ctx.faults.report({
				status: 500,
				message: BUG_REPORT_API_FAILED,
				path: event.url.pathname,
				userId: actor.id
			});
			return reply(500, { error: BUG_REPORT_API_FAILED });
		}
	}
});

/**
 * `POST /api/report-phrase`: signed in, 20 reports per 5 minutes per IP. A
 * storage failure is swallowed by the service, so the caller always gets 200.
 */
export const reportUnmatchedPhraseEndpoint = endpoint({
	auth: 'user',
	rateLimit: {
		scope: 'report-phrase',
		limit: 20,
		windowMs: 5 * 60 * 1000,
		message: 'Too many reports. Try again shortly.'
	},
	body: UnmatchedPhraseBody,
	handle: async ({ ctx, actor, body }) => {
		await reportUnmatchedPhrase(ctx, actor, body);
		const response: PhraseReportedResponse = { success: true };
		return ok(response);
	}
});

/** `GET /api/admin/bugs`: the bug register plus the open-only export text. */
export const listBugReportsEndpoint = endpoint({
	auth: 'admin',
	handle: async ({ ctx, actor }) => {
		const { open, resolved } = await listFeedback(ctx, actor, 'bug');
		const response: BugReportsRegisterResponse = {
			open: open.map(bugReportWithReporterWire),
			resolved: resolved.map(bugReportWithReporterWire),
			exportText: formatBugReportsExport(open, ctx.clock.now(), EXPORT_ZONE)
		};
		return ok(response);
	}
});

/** `GET /api/admin/nlp`: the phrase register plus the open-only export text. */
export const listUnmatchedPhrasesEndpoint = endpoint({
	auth: 'admin',
	handle: async ({ ctx, actor }) => {
		const { open, resolved } = await listFeedback(ctx, actor, 'phrase');
		const response: UnmatchedPhrasesRegisterResponse = {
			phrases: open.map(unmatchedPhraseWire),
			resolved: resolved.map(unmatchedPhraseWire),
			exportText: formatUnmatchedPhrasesExport(open, ctx.clock.now(), EXPORT_ZONE)
		};
		return ok(response);
	}
});

/** `POST /api/admin/bugs/[id]/resolve`: `200 {success, report}` or the 404 copy. */
export const resolveBugReportEndpoint = endpoint({
	auth: 'admin',
	params: FeedbackResolveParams,
	handle: async ({ ctx, actor, params }) => {
		const report = await resolveFeedback(ctx, actor, 'bug', params.id);
		const response: BugReportResolvedResponse = { success: true, report: bugReportWire(report) };
		return ok(response);
	}
});

/** `POST /api/admin/nlp/[id]/resolve`: `200 {success, phrase}` or the 404 copy. */
export const resolveUnmatchedPhraseEndpoint = endpoint({
	auth: 'admin',
	params: FeedbackResolveParams,
	handle: async ({ ctx, actor, params }) => {
		const phrase: UnmatchedPhraseRow = await resolveFeedback(ctx, actor, 'phrase', params.id);
		const response: UnmatchedPhraseResolvedResponse = {
			success: true,
			phrase: unmatchedPhraseWire(phrase)
		};
		return ok(response);
	}
});

/**
 * `load` for `/report-bug`: signed-in only (302 to `/login` otherwise), and
 * the reported page is `?from` then the GET referer (issue 257).
 */
export const reportBugPageLoad = pageLoad({
	auth: 'user',
	handle: async ({ event }) => {
		const from =
			safeReportedPath(event.url.searchParams.get('from'), event.url.origin) ||
			safeReportedPath(event.request.headers.get('referer'), event.url.origin);
		return { areas: [...BUG_AREAS], from };
	}
});

/**
 * The `/report-bug` submit action: legacy order and bodies — the 401 before
 * the form is read, then `BugReportFormBody`'s one message per field, and
 * every failure echoes the posted `area`/`description` so the page can keep
 * them. The posted hidden `from` beats the POST referer, and the recorded url
 * falls back to the form's own path. The 401 copy is the page's own ("Please
 * log in to report a bug."), not the kernel's default, so the page checks the
 * actor itself; the action parses the form itself for the same reason (the
 * kernel parses before `handle`).
 */
export const submitBugReportAction = formAction({
	auth: 'optional',
	failMessage: BUG_REPORT_SAVE_FAILED,
	handle: async ({ ctx, actor, event }) => {
		if (!actor) {
			return fail(401, { error: 'Please log in to report a bug.', area: '', description: '' });
		}
		const data = await event.request.formData();
		const area = String(data.get('area') ?? '');
		const description = String(data.get('description') ?? '').trim();
		const parsed = BugReportFormBody.safeParse({
			area,
			description,
			from: String(data.get('from') ?? '')
		});
		if (!parsed.success) {
			return fail(400, { error: firstIssueMessage(parsed.error), area, description });
		}
		const from =
			safeReportedPath(parsed.data.from, event.url.origin) ||
			safeReportedPath(event.request.headers.get('referer'), event.url.origin);
		try {
			await fileBugReport(ctx, actor, {
				area: parsed.data.area,
				description: parsed.data.description,
				url: from || event.url.pathname
			});
		} catch (cause) {
			ctx.log.error('bug_report_failed', {
				message: cause instanceof Error ? cause.message : String(cause)
			});
			return fail(500, { error: BUG_REPORT_SAVE_FAILED, area, description });
		}
		return { ok: true };
	}
});
