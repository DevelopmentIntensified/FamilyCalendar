/**
 * feedback register state: one admin register's client state, one class per
 * kind so the rows stay typed (a bug row and a phrase row render differently).
 *
 * The class owns the optimistic resolve, its rollback, the pending flag and
 * the toast; the export text is derived from the open rows, so a resolve
 * removes the row from the agent text without a reload (issue 262). Runes and
 * methods only — no `$effect` — so it is tested in node with a fake api and
 * `memoryToasts()`.
 *
 * The admin screen builds one of these from its page data and passes the
 * fields to `ui/FeedbackRegister.svelte`; `now` and `zone` come from the
 * page load (the same pair the server export used), never from the clock
 * here (rule R5).
 *
 * Doc: ./README.md#public-interface
 */
import type { Toasts } from '$lib/kernel/client/toasts.svelte';
import { dayKey } from '$lib/kernel/time/dates';
import type { FeedbackRegisterApi } from './feedback.api';
import type {
	BugReportWithReporter,
	FeedbackBugRegister,
	FeedbackPhraseRegister,
	UnmatchedPhraseView
} from './feedback.contract';
import { formatBugReportsExport, formatUnmatchedPhrasesExport } from './feedback.export.rules';
import { markBugReportResolved, markUnmatchedPhraseResolved } from './feedback.rules';

/** The bug-report register: rows, an optimistic resolve and the agent export text. */
export class FeedbackBugRegisterState {
	open = $state<BugReportWithReporter[]>([]);
	resolved = $state<BugReportWithReporter[]>([]);
	/** The row a resolve is in flight for, so its button can show it. */
	pendingId = $state<string | null>(null);

	private readonly api: FeedbackRegisterApi;
	private readonly toasts: Toasts;
	private readonly now: Date;
	private readonly zone: string;
	/** `YYYY-MM-DD` for the export's download name, in the page's zone. */
	readonly today: string;

	/**
	 * The agent-ready text of the open rows only (issue 262: it follows a
	 * resolve). A getter, not a `$derived` field: the field initialiser would
	 * read `now`/`zone` before the constructor assigns them.
	 */
	get exportText(): string {
		return formatBugReportsExport(this.open, this.now, this.zone);
	}

	constructor(
		api: FeedbackRegisterApi,
		toasts: Toasts,
		initial: FeedbackBugRegister,
		now: Date,
		zone: string
	) {
		this.api = api;
		this.toasts = toasts;
		this.now = now;
		this.zone = zone;
		this.today = dayKey(now, zone);
		this.open = [...initial.open];
		this.resolved = [...initial.resolved];
	}

	/** Resolve one report: optimistic move, then keep it or roll back and explain. */
	async resolve(id: string): Promise<void> {
		if (this.pendingId !== null) return;
		const open = this.open;
		const resolved = this.resolved;
		this.pendingId = id;
		const marked = markBugReportResolved({ open, resolved }, id, this.now);
		this.open = [...marked.open];
		this.resolved = [...marked.resolved];
		const result = await this.api.resolveBugReport(id);
		this.pendingId = null;
		if (!result.ok) {
			this.open = [...open];
			this.resolved = [...resolved];
			this.toasts.error(result.error);
			return;
		}
		this.toasts.success('Resolved');
	}
}

/** The unmatched-phrase register: the same shape and behaviour, phrase rows. */
export class FeedbackPhraseRegisterState {
	open = $state<UnmatchedPhraseView[]>([]);
	resolved = $state<UnmatchedPhraseView[]>([]);
	pendingId = $state<string | null>(null);

	private readonly api: FeedbackRegisterApi;
	private readonly toasts: Toasts;
	private readonly now: Date;
	private readonly zone: string;
	readonly today: string;

	/** The same getter shape as the bug register (issue 262). */
	get exportText(): string {
		return formatUnmatchedPhrasesExport(this.open, this.now, this.zone);
	}

	constructor(
		api: FeedbackRegisterApi,
		toasts: Toasts,
		initial: FeedbackPhraseRegister,
		now: Date,
		zone: string
	) {
		this.api = api;
		this.toasts = toasts;
		this.now = now;
		this.zone = zone;
		this.today = dayKey(now, zone);
		this.open = [...initial.open];
		this.resolved = [...initial.resolved];
	}

	/** Resolve one phrase: optimistic move, then keep it or roll back and explain. */
	async resolve(id: string): Promise<void> {
		if (this.pendingId !== null) return;
		const open = this.open;
		const resolved = this.resolved;
		this.pendingId = id;
		const marked = markUnmatchedPhraseResolved({ open, resolved }, id, this.now);
		this.open = [...marked.open];
		this.resolved = [...marked.resolved];
		const result = await this.api.resolveUnmatchedPhrase(id);
		this.pendingId = null;
		if (!result.ok) {
			this.open = [...open];
			this.resolved = [...resolved];
			this.toasts.error(result.error);
			return;
		}
		this.toasts.success('Resolved');
	}
}
