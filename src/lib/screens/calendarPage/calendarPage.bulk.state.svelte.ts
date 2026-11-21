/**
 * calendarPage bulk state: what the selection bar remembers and does.
 *
 * The wire is calendar's (`POST /api/events/bulk`), reached through its client
 * api; the bar's copy and its rules are this screen's
 * (`calendarPage.bulk.rules.ts`). Everything here is an explicit method — no
 * `$effect` — so the class runs in node under a test with a fake api and fake
 * toasts (R9).
 *
 * Legacy (`+page.svelte:190-296`, `BulkEditBar.svelte`): delete is a two-step
 * inline confirm (never `window.confirm`); smart mode is dry-run → review list →
 * apply, a plan moving Events into the past asks `Apply anyway`, and a server
 * `error` is shown verbatim with `Hmm, that didn't take. Try again.` as the
 * network fallback.
 *
 * Doc: ./README.md#selection-bulk-edit-and-the-modals
 */
import type { CalendarApi } from '$lib/domains/calendar/index';
import type { Toasts } from '$lib/kernel/client/toasts.svelte';
import {
	calendarBulkPlanLabel,
	calendarBulkPlanMovesToPast,
	type CalendarBulkPlanEvent,
	type CalendarBulkPlanOp
} from './calendarPage.bulk.rules';
import type { CalendarPageCalendar } from './calendarPage.contract';

/** The five bulk operations the wire accepts. */
export type CalendarBulkOp =
	| { readonly type: 'delete' }
	| { readonly type: 'calendar'; readonly calendarId: string }
	| { readonly type: 'location'; readonly location: string }
	| { readonly type: 'attendants'; readonly add: readonly string[] }
	| { readonly type: 'smart'; readonly instruction: string };

/** A reviewed plan: the ops to echo back, and the lines the person read. */
export type CalendarBulkPlan = {
	readonly ops: CalendarBulkPlanOp[];
	readonly items: readonly { readonly id: string; readonly label: string }[];
};

/** Files a misparsed smart phrase with feedback's register (`/api/report-phrase`). */
export type CalendarBulkReport = (input: {
	readonly phrase: string;
	readonly matched: {
		readonly instruction: string;
		readonly eventCount: number;
		readonly plannedOps: readonly CalendarBulkPlanOp[];
	};
}) => Promise<boolean>;

export type CalendarBulkStateOptions = {
	readonly api: CalendarApi;
	readonly toasts: Toasts;
	readonly calendars: readonly CalendarPageCalendar[];
	/** The rows a plan can name, for the review list's labels. */
	readonly events: () => readonly CalendarBulkPlanEvent[];
	/** The viewer's today key, so a plan's past dates are judged once (R5). */
	readonly todayKey: () => string;
	/** Reloads the page data after a write (the route's `invalidateAll`). */
	readonly onapplied: () => Promise<void>;
	readonly report?: CalendarBulkReport;
};

const DEFAULT_ERROR = "Hmm, that didn't take. Try again.";
const NO_MATCH_ERROR = 'Could not match that instruction. Try naming a date or the events.';

export class CalendarBulkState {
	busy = $state(false);
	error = $state('');
	confirmDelete = $state(false);
	plan = $state<CalendarBulkPlan | null>(null);
	pastWarning = $state(false);
	reporting = $state(false);
	reported = $state(false);
	moreTools = $state(false);
	location = $state('');
	attendants = $state('');
	instruction = $state('');

	private readonly api: CalendarApi;
	private readonly toasts: Toasts;
	private readonly calendars: readonly CalendarPageCalendar[];
	private readonly events: () => readonly CalendarBulkPlanEvent[];
	private readonly todayKey: () => string;
	private readonly onapplied: () => Promise<void>;
	private readonly report: CalendarBulkReport | undefined;

	constructor(options: CalendarBulkStateOptions) {
		this.api = options.api;
		this.toasts = options.toasts;
		this.calendars = options.calendars;
		this.events = options.events;
		this.todayKey = options.todayKey;
		this.onapplied = options.onapplied;
		this.report = options.report;
	}

	/** Leave selection mode: every bar state drops with it. */
	reset(): void {
		this.error = '';
		this.confirmDelete = false;
		this.plan = null;
		this.pastWarning = false;
		this.reported = false;
		this.moreTools = false;
		this.location = '';
		this.attendants = '';
		this.instruction = '';
	}

	/** The delete confirm's own line: the count it will remove. */
	get deleteQuestion(): string {
		return 'Delete the selected events? Attached checklists go too.';
	}

	async runBulk(ids: readonly string[], op: CalendarBulkOp): Promise<void> {
		if (ids.length === 0 || this.busy) return;
		this.busy = true;
		this.error = '';
		this.confirmDelete = false;
		this.reported = false;
		try {
			const result = await this.api.bulkEdit({ ids: ids.map((id) => ({ id })), op });
			if (!result.ok) {
				this.error = result.error || DEFAULT_ERROR;
				return;
			}
			this.toasts.success(this.appliedToast(ids.length, op));
			this.location = '';
			this.attendants = '';
			this.instruction = '';
			await this.onapplied();
		} catch {
			this.error = DEFAULT_ERROR;
		} finally {
			this.busy = false;
		}
	}

	/**
	 * Smart mode: the first call is the dry run that returns a plan; the second
	 * echoes that plan back for execution (the legacy two-phase wire, kept —
	 * calendar's contract owns that trust boundary).
	 */
	async runSmart(ids: readonly string[], force = false): Promise<void> {
		const instruction = this.instruction.trim();
		if (!instruction || ids.length === 0 || this.busy) return;
		if (!force && this.plan && calendarBulkPlanMovesToPast(this.plan.ops, this.todayKey())) {
			this.pastWarning = true;
			return;
		}
		this.pastWarning = false;
		this.busy = true;
		this.error = '';
		this.reported = false;
		const reviewed = this.plan;
		try {
			const result = await this.api.bulkEdit({
				ids: ids.map((id) => ({ id })),
				op: { type: 'smart', instruction },
				dryRun: !reviewed,
				plan: reviewed?.ops
			});
			if (!result.ok) {
				this.error = result.error || DEFAULT_ERROR;
				this.plan = null;
				return;
			}
			if (reviewed) {
				const count = reviewed.items.length;
				this.toasts.success(`Applied ${count} change${count === 1 ? '' : 's'} to your events.`);
				this.plan = null;
				this.instruction = '';
				await this.onapplied();
				return;
			}
			if (!('plan' in result.data) || result.data.plan.length === 0) {
				this.error = NO_MATCH_ERROR;
				return;
			}
			const ops = result.data.plan;
			this.plan = {
				ops,
				items: ops.map((op) => ({
					id: op.id,
					label: calendarBulkPlanLabel(op, this.events(), this.calendars, this.todayKey())
				}))
			};
		} catch {
			this.error = DEFAULT_ERROR;
		} finally {
			this.busy = false;
		}
	}

	/** File the phrase that produced a failed plan, once. */
	async reportPhrase(ids: readonly string[]): Promise<void> {
		if (!this.report || this.reporting) return;
		this.reporting = true;
		try {
			const reported = await this.report({
				phrase: this.instruction.trim(),
				matched: {
					instruction: this.instruction.trim(),
					eventCount: ids.length,
					plannedOps: this.plan?.ops ?? []
				}
			});
			if (reported) this.reported = true;
		} finally {
			this.reporting = false;
		}
	}

	private appliedToast(count: number, op: CalendarBulkOp): string {
		const events = `${count} event${count === 1 ? '' : 's'}`;
		switch (op.type) {
			case 'delete':
				return `Deleted ${events}.`;
			case 'calendar': {
				const calendar = this.calendars.find((row) => row.id === op.calendarId);
				return `Moved ${events}${calendar ? ` to ${calendar.name}` : ''}.`;
			}
			case 'location':
				return `Location updated on ${events}.`;
			case 'attendants':
				return `Attendant added to ${events}.`;
			case 'smart':
				return `Applied ${events}.`;
		}
	}
}
