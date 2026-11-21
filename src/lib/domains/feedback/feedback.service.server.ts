/**
 * feedback services: one function per use case, `(ctx, actor, input)`.
 *
 * Authorization lives here (the admin gate on both registers, the not-found
 * copy per kind); the wire bodies are built by `feedback.http.server.ts`.
 * Time comes from `ctx.clock`, the auto-file throttle from `ctx.limiter`, and
 * the write shapes from `feedback.rules.ts`, so nothing in this file reads the
 * process clock or owns a second copy of a rule.
 *
 * Two functions are best-effort and never throw, matching legacy:
 * `fileAutoBugReport` (a fault filer must not break the error response) and
 * `reportUnmatchedPhrase` (a parser report must not fail the caller).
 *
 * Doc: ./README.md#public-interface
 */
import type { Actor } from '$lib/kernel/ctx/actor';
import type { Ctx, Fault } from '$lib/kernel/ctx/ctx.server';
import { withTx } from '$lib/kernel/db/database.server';
import type { BugReportRow, UnmatchedPhraseRow } from '$lib/kernel/db/tables.server';
import { forbidden, invalid, notFound } from '$lib/kernel/errors/appError';
import {
	BUG_REPORT_INVALID_MESSAGE,
	type BugReportInput,
	type BugReportWithReporter,
	type FeedbackKind,
	type UnmatchedPhraseBody,
	type UnmatchedPhraseView
} from './feedback.contract';
import { buildAutoBugReport, bugReportDraft, unmatchedPhraseUpsert } from './feedback.rules';
import {
	countOpenBugReports,
	countOpenUnmatchedPhrases,
	insertBugReport,
	listOpenBugReportsWithReporter,
	listOpenUnmatchedPhrases,
	listResolvedBugReportsWithReporter,
	listResolvedUnmatchedPhrases,
	pruneClosedBugReports,
	pruneResolvedUnmatchedPhrases,
	resolveBugReport,
	resolveUnmatchedPhrase,
	upsertUnmatchedPhrase
} from './feedback.repo.server';

/** One auto report per failure key per ten minutes (legacy `THROTTLE_MS`). */
const AUTO_REPORT_WINDOW_MS = 10 * 60 * 1000;

/** The bug-report register: rows plus the reporter's names from the `users` join. */
export type FeedbackBugRegister = {
	readonly open: BugReportWithReporter[];
	readonly resolved: BugReportWithReporter[];
};

/** The unmatched-phrase register, open and resolved. */
export type FeedbackPhraseRegister = {
	readonly open: UnmatchedPhraseView[];
	readonly resolved: UnmatchedPhraseView[];
};

/** The 404 copy each register uses for an unknown id. */
const NOT_FOUND_MESSAGE: Readonly<Record<FeedbackKind, string>> = {
	bug: 'Bug report not found',
	phrase: 'Phrase not found'
};

/**
 * Store a user-filed report for `actor` and return its id. The one write path
 * for `POST /api/bug-report` and the `/report-bug` action: the area falls back
 * to `other`, the description is trimmed and capped at 5000, the url is
 * trimmed, capped at 2000 and blank becomes `null`.
 *
 * A write failure propagates: the boundary logs it, files the fault, and
 * answers the legacy 500 copy.
 */
export async function fileBugReport(
	ctx: Ctx,
	actor: Actor,
	input: BugReportInput
): Promise<{ id: string }> {
	const draft = bugReportDraft(input);
	// Both callers validate first; this is the writer's second line of defence
	// (legacy `createBugReport` returned null for a blank description).
	if (!draft) throw invalid(BUG_REPORT_INVALID_MESSAGE);
	const row = await insertBugReport(ctx.db, { userId: actor.id, ...draft });
	return { id: row.id };
}

/**
 * File one report for a 500, or do nothing: 404s, blank messages and client
 * aborts never file (#049), anonymous callers never file (#153), and one
 * filing per failure key is allowed every ten minutes. Never throws — the
 * fault port is fire-and-forget and must not break the error response.
 */
export async function fileAutoBugReport(ctx: Ctx, fault: Fault): Promise<void> {
	try {
		// #153: a crash reachable without a session is attacker noise, not a signal.
		if (!fault.userId) return;
		const report = buildAutoBugReport(fault);
		if (!report) return;
		const key = `${report.area}:${fault.path}:${fault.message.slice(0, 120)}`;
		if (!ctx.limiter.allow(key, 1, AUTO_REPORT_WINDOW_MS)) return;
		await insertBugReport(ctx.db, { userId: fault.userId, ...report });
	} catch (error) {
		ctx.log.warn('auto_bug_report_failed', {
			message: error instanceof Error ? error.message : String(error)
		});
	}
}

/**
 * Record a phrase a parser could not handle: normalized, deduplicated on
 * `(source, phrase)`, count bumped on a repeat. A blank phrase stores nothing.
 * A storage failure is logged and swallowed — the report is a signal, never a
 * reason to fail the caller's request.
 */
export async function reportUnmatchedPhrase(
	ctx: Ctx,
	_actor: Actor,
	input: UnmatchedPhraseBody
): Promise<void> {
	const upsert = unmatchedPhraseUpsert(input.source, input.phrase, input.matched);
	if (!upsert) return;
	try {
		await upsertUnmatchedPhrase(ctx.db, { ...upsert, now: ctx.clock.now() });
	} catch (error) {
		ctx.log.warn('unmatched_phrase_report_failed', {
			message: error instanceof Error ? error.message : String(error)
		});
	}
}

/**
 * One admin register as `{ open, resolved }`. The admin gate lives here, so a
 * screen or endpoint cannot forget it.
 */
export function listFeedback(
	ctx: Ctx,
	actor: Actor,
	kind: 'bug'
): Promise<FeedbackBugRegister>;
export function listFeedback(
	ctx: Ctx,
	actor: Actor,
	kind: 'phrase'
): Promise<FeedbackPhraseRegister>;
export async function listFeedback(
	ctx: Ctx,
	actor: Actor,
	kind: FeedbackKind
): Promise<FeedbackBugRegister | FeedbackPhraseRegister> {
	if (!actor.isAdmin) throw forbidden();
	if (kind === 'bug') {
		// Sequential, not Promise.all: the ctx db may be one transaction session.
		const open = await listOpenBugReportsWithReporter(ctx.db);
		const resolved = await listResolvedBugReportsWithReporter(ctx.db);
		return { open, resolved };
	}
	const open = await listOpenUnmatchedPhrases(ctx.db);
	const resolved = await listResolvedUnmatchedPhrases(ctx.db);
	return { open, resolved };
}

/**
 * Close one row of either register, stamped with `ctx.clock.now()`; a second
 * resolve answers with a re-stamped row, as both goldens pin (Q-007). The
 * not-found copy differs per kind.
 */
export function resolveFeedback(
	ctx: Ctx,
	actor: Actor,
	kind: 'bug',
	id: string
): Promise<BugReportRow>;
export function resolveFeedback(
	ctx: Ctx,
	actor: Actor,
	kind: 'phrase',
	id: string
): Promise<UnmatchedPhraseRow>;
export async function resolveFeedback(
	ctx: Ctx,
	actor: Actor,
	kind: FeedbackKind,
	id: string
): Promise<BugReportRow | UnmatchedPhraseRow> {
	if (!actor.isAdmin) throw forbidden();
	const now = ctx.clock.now();
	const row =
		kind === 'bug'
			? await resolveBugReport(ctx.db, id, now)
			: await resolveUnmatchedPhrase(ctx.db, id, now);
	if (!row) throw notFound(NOT_FOUND_MESSAGE[kind]);
	return row;
}

/**
 * One badge leg: open bug reports, i.e. reports without a `resolvedAt`. Split
 * from `countOpenFeedback` so the `admin` screen can degrade each badge on its
 * own — the `/api/admin` golden pins one broken leg leaving the other leg's
 * real count standing.
 */
export async function openBugReportCount(ctx: Ctx): Promise<number> {
	return countOpenBugReports(ctx.db);
}

/** The other badge leg: unmatched phrases with `resolved = false`. */
export async function openUnmatchedPhraseCount(ctx: Ctx): Promise<number> {
	return countOpenUnmatchedPhrases(ctx.db);
}

/**
 * The admin nav badge's two open counts. The caller (the admin layout) owns
 * the degrade-to-zero guard, as legacy `guard('admin-counts', 0, …)` did.
 */
export async function countOpenFeedback(ctx: Ctx): Promise<{ bugs: number; phrases: number }> {
	// Sequential, not Promise.all: the ctx db may be one transaction session.
	const bugs = await openBugReportCount(ctx);
	const phrases = await openUnmatchedPhraseCount(ctx);
	return { bugs, phrases };
}

/**
 * 180-day retention, one transaction: closed reports and resolved phrases
 * before the cutoff go, open items never match. Called by `app`'s cleanup
 * cron with the cutoff it computes.
 */
export async function pruneFeedbackOlderThan(
	ctx: Ctx,
	cutoff: Date
): Promise<{ bugs: number; phrases: number }> {
	return withTx(ctx, async (txCtx) => {
		const bugs = await pruneClosedBugReports(txCtx.db, cutoff);
		const phrases = await pruneResolvedUnmatchedPhrases(txCtx.db, cutoff);
		return { bugs, phrases };
	});
}
