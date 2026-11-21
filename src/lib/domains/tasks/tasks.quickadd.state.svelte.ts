/**
 * tasks quick-add state — the "New task" card's behaviour: the live parse of
 * the title being typed, the paste-a-list bulk branch (arm, then confirm), the
 * smart-task templates, and the one `POST /api/tasks` every path goes through.
 *
 * Parsing owns the grammar; this class owns the picker fallbacks, the busy
 * flags and the toast copy. No DOM and no `$effect` beyond the derived fields,
 * so it is tested in node (`port-ui.md`).
 *
 * Legacy home: `components/tasks/AddTaskCard.svelte`'s script.
 */

import { parseTaskQuickAdd, type TaskQuickAddResult } from '$lib/domains/parsing';
import { systemClock } from '$lib/kernel/time/clock';
import type { Toasts } from '$lib/kernel/client/toasts.svelte';
import type { TaskSmartTemplate } from './tasks.smart.rules';
import type { TasksApi } from './tasks.api';
import type { TaskPageRow, TaskRosterMember } from './tasks.contract';
import { taskFreqNoun } from './tasks.display.rules';
import { taskRowFromWire } from './tasks.list.rules';
import {
	buildTaskQuickAddBody,
	bulkAddedMessage,
	bulkFailedMessage,
	shortTaskTitle,
	splitTaskRecords,
	taskQuickAddRefusal
} from './tasks.quickadd.rules';

export type TaskQuickAddStateOptions = {
	readonly api: TasksApi;
	readonly toasts: Toasts;
	readonly refresh: () => Promise<void>;
	readonly roster: readonly TaskRosterMember[];
	readonly familyId: string | null;
	/** The viewer's stored zone — every parsed due date lands at 23:59 there. */
	readonly zone: string;
	readonly clock?: () => Date;
	/** The page shows the created row instantly; the next re-read reconciles. */
	readonly onAdded?: (row: TaskPageRow) => void;
	/** The page's inline error banner. */
	readonly onError?: (message: string) => void;
	/** The category names the picker offers. */
	readonly categories?: readonly string[];
};

export class TaskQuickAddState {
	title = $state('');
	/** The picker's `YYYY-MM-DD`, or '' for none. */
	dueDate = $state('');
	/** New tasks default to private (the legacy card's default). */
	visibility = $state<'public' | 'private'>('private');
	category = $state('');
	showMore = $state(false);
	adding = $state(false);
	bulkAdding = $state(false);
	bulkDone = $state(0);
	bulkConfirming = $state(false);
	busyTemplateId = $state<string | null>(null);
	rowBusyKey = $state<string | null>(null);
	skippedKeys = $state<string[]>([]);

	private readonly api: TasksApi;
	private readonly toasts: Toasts;
	private readonly refresh: () => Promise<void>;
	readonly roster: readonly TaskRosterMember[];
	private readonly familyId: string | null;
	private readonly zone: string;
	private readonly clock: () => Date;
	private readonly onAdded: (row: TaskPageRow) => void;
	private readonly onError: (message: string) => void;

	constructor(options: TaskQuickAddStateOptions) {
		this.api = options.api;
		this.toasts = options.toasts;
		this.refresh = options.refresh;
		this.roster = options.roster;
		this.familyId = options.familyId;
		this.zone = options.zone;
		this.clock = options.clock ?? systemClock.now;
		this.onAdded = options.onAdded ?? (() => {});
		this.onError = options.onError ?? (() => {});
	}

	/** The live parse: what the chips preview and what submit sends. */
	quick = $derived<TaskQuickAddResult | null>(this.parse(this.title));

	bulkRows = $derived(
		splitTaskRecords(this.title)
			.filter((record) => record.text)
			.flatMap((record) => {
				const parsed = this.parse(record.text);
				return parsed ? [{ record, parsed }] : [];
			})
	);
	isBulk = $derived(this.bulkRows.length > 1);
	activeRows = $derived(this.bulkRows.filter((row) => !this.skippedKeys.includes(row.record.text)));
	bulkBlocked = $derived(
		this.activeRows.find((row) => row.parsed.unknownMember)?.parsed.unknownMember ?? null
	);
	/** The single-input refusal, shown inline under the field. */
	quickUnknownMember = $derived(this.isBulk ? null : (this.quick?.unknownMember ?? null));

	private parse(text: string): TaskQuickAddResult | null {
		if (!text.trim()) return null;
		return parseTaskQuickAdd(text, {
			now: this.clock(),
			zone: this.zone,
			members: this.roster.map((member) => ({
				userId: member.userId,
				firstName: member.firstName,
				lastName: member.lastName
			}))
		});
	}

	memberName = (userId: string): string => {
		const member = this.roster.find((entry) => entry.userId === userId);
		return member ? `${member.firstName} ${member.lastName}`.trim() : userId.slice(0, 8);
	};

	/** "Today" / "Tomorrow" / "Next week" shortcuts. */
	setQuickDate(days: number): void {
		const date = this.clock();
		date.setDate(date.getDate() + days);
		const pad = (n: number) => String(n).padStart(2, '0');
		this.dueDate = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
	}

	/** The bulk review step's Back button: the arm is dropped without a submit. */
	cancelBulkConfirm(): void {
		this.bulkConfirming = false;
	}

	toggleShowMore(): void {
		this.showMore = !this.showMore;
	}

	toggleSkip(key: string): void {
		this.skippedKeys = this.skippedKeys.includes(key)
			? this.skippedKeys.filter((existing) => existing !== key)
			: [...this.skippedKeys, key];
	}

	/** Drop one record's lines from the composer (after a per-row create or ✕). */
	removeRowLines(key: string): void {
		this.title = splitTaskRecords(this.title)
			.filter((record) => record.text && record.text !== key)
			.map((record) => record.text)
			.join('\n');
		this.skippedKeys = this.skippedKeys.filter((existing) => existing !== key);
	}

	/** Any edit re-arms the bulk confirm and prunes skip keys of vanished rows. */
	private rearmBulk(): void {
		this.bulkConfirming = false;
		const alive = new Set(splitTaskRecords(this.title).map((record) => record.text));
		const pruned = this.skippedKeys.filter((key) => alive.has(key));
		if (pruned.length !== this.skippedKeys.length) this.skippedKeys = pruned;
	}

	setTitle(value: string): void {
		this.title = value;
		this.rearmBulk();
	}

	setDueDate(value: string): void {
		this.dueDate = value;
	}

	setVisibility(value: 'public' | 'private'): void {
		this.visibility = value;
	}

	setCategory(value: string): void {
		this.category = value;
	}

	private bodyFor(parsed: TaskQuickAddResult) {
		return buildTaskQuickAddBody(parsed, {
			dueDateFallback: this.dueDate ? `${this.dueDate}T23:59:00` : null,
			visibilityFallback: this.visibility,
			familyId: this.familyId,
			category: this.category,
			now: this.clock()
		});
	}

	private async createOne(text: string): Promise<{ ok: true; title: string; row: TaskPageRow } | { ok: false; error: string }> {
		const parsed = this.parse(text);
		if (!parsed) return { ok: false, error: 'Title is required' };
		const refusal = taskQuickAddRefusal(parsed, this.familyId);
		if (refusal) return { ok: false, error: refusal };
		const result = await this.api.create(this.bodyFor(parsed));
		if (!result.ok) return { ok: false, error: result.error };
		return { ok: true, title: parsed.title, row: taskRowFromWire(result.data.task) };
	}

	/** The form's one action: a single Task, or the armed bulk confirm. */
	async add(): Promise<void> {
		if (!this.title.trim() || this.adding || this.bulkAdding) return;
		if (this.isBulk) {
			await this.addBulk();
			return;
		}
		this.adding = true;
		try {
			const created = await this.createOne(this.title);
			if (!created.ok) {
				this.onError(created.error);
				return;
			}
			this.toasts.success(`Added "${created.title}".`);
			this.title = '';
			this.dueDate = '';
			this.category = '';
			this.onAdded(created.row);
			await this.refresh();
		} finally {
			this.adding = false;
		}
	}

	/** Bulk: review first, then one POST per record; failures stay for a retry. */
	private async addBulk(): Promise<void> {
		if (this.bulkBlocked) return;
		if (!this.bulkConfirming) {
			this.bulkConfirming = true;
			return;
		}
		this.bulkAdding = true;
		this.bulkDone = 0;
		const failedKeys = new Set<string>();
		const failedNames: string[] = [];
		try {
			for (const { record, parsed } of this.activeRows) {
				const created = await this.createOne(record.text);
				if (created.ok) {
					this.bulkDone += 1;
					this.onAdded(created.row);
					continue;
				}
				failedKeys.add(record.text);
				failedNames.push(shortTaskTitle(parsed.title));
			}
			const total = this.activeRows.length;
			if (failedKeys.size) {
				this.toasts.error(bulkFailedMessage(this.bulkDone, total, failedNames));
				this.title = this.activeRows
					.filter((row) => failedKeys.has(row.record.text))
					.map((row) => row.record.text)
					.join('\n');
			} else {
				this.toasts.success(bulkAddedMessage(this.bulkDone, total));
				this.title = '';
				this.dueDate = '';
				this.category = '';
			}
			await this.refresh();
		} finally {
			this.bulkAdding = false;
			this.bulkConfirming = false;
		}
	}

	/** Per-row Create in the bulk list: one Task, then its lines leave the box. */
	async createRow(key: string, text: string): Promise<void> {
		if (this.rowBusyKey) return;
		this.rowBusyKey = key;
		try {
			const created = await this.createOne(text);
			if (!created.ok) {
				this.onError(created.error);
				return;
			}
			this.toasts.success(`Added "${created.title}".`);
			this.onAdded(created.row);
			this.removeRowLines(key);
			await this.refresh();
		} finally {
			this.rowBusyKey = null;
		}
	}

	/** A smart Task template: first occurrence today, the cadence keeps it coming. */
	async addSmartTask(template: TaskSmartTemplate): Promise<void> {
		if (this.busyTemplateId) return;
		this.busyTemplateId = template.id;
		const due = new Date(this.clock().getTime());
		due.setHours(23, 59, 0, 0);
		const result = await this.api.create({
			title: template.name,
			dueDate: due.toISOString(),
			recurrenceFrequency: template.recurrenceFrequency,
			recurrenceInterval: template.recurrenceInterval
		});
		this.busyTemplateId = null;
		if (!result.ok) {
			this.toasts.error(`Couldn't add "${template.name}" — try again.`);
			return;
		}
		const note = this.cadenceNote(template);
		this.toasts.success(
			`Added "${template.name}"${note ? ` — ${note.toLowerCase()}` : ''}.`
		);
		this.onAdded(taskRowFromWire(result.data.task));
		await this.refresh();
	}

	/** "Every 2 weeks" — the template's own description, else generated. */
	cadenceNote(template: TaskSmartTemplate): string {
		if (template.description) return template.description;
		const noun = taskFreqNoun(template.recurrenceFrequency) ?? template.recurrenceFrequency;
		return template.recurrenceInterval > 1
			? `Every ${template.recurrenceInterval} ${noun}s`
			: `Every ${noun}`;
	}
}
