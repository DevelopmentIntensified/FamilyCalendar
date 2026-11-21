/**
 * tasks checklist state — the Event modal's checklist: the Event's Tasks read
 * through `GET /api/tasks?eventId=`, inline add/toggle/remove, and the pending
 * titles the create flow queues before the Event exists (the parent binds them
 * and flushes after the Event is saved).
 *
 * The rows are a small list with one busy flag, exactly like the legacy
 * section: a checklist row is a tap, not a form. No DOM, so the class is
 * tested in node.
 *
 * Legacy home: `components/calendar/ChecklistSection.svelte` (its script and
 * its events; the markup is rebuilt in `ui/EventTaskChecklist.svelte`).
 */

import type { TasksApi } from './tasks.api';
import type { TaskWire } from './tasks.contract';

export type TaskChecklistOptions = {
	readonly api: TasksApi;
	readonly eventId: string | null;
	readonly pendingTitles?: readonly string[];
	readonly onPendingTitlesChange?: (titles: string[]) => void;
	/** Reported so the parent can warn before deleting an Event with Tasks. */
	readonly onAttachedCountChange?: (count: number) => void;
};

export class EventTaskChecklistState {
	rows = $state<TaskWire[]>([]);
	loading = $state(false);
	busy = $state(false);
	error = $state('');
	showInput = $state(false);
	draftTitle = $state('');
	pending = $state<string[]>([]);

	private readonly api: TasksApi;
	private readonly onPendingTitlesChange: (titles: string[]) => void;
	private readonly onAttachedCountChange: (count: number) => void;
	private loadedFor: string | null = null;

	constructor(options: TaskChecklistOptions) {
		this.api = options.api;
		this.pending = [...(options.pendingTitles ?? [])];
		this.onPendingTitlesChange = options.onPendingTitlesChange ?? (() => {});
		this.onAttachedCountChange = options.onAttachedCountChange ?? (() => {});
	}

	/** The attach count the parent warns on; `Todo` rows included. */
	attachedCount = $derived(this.rows.length);

	/** The Event the checklist belongs to; a new id re-reads once. */
	async load(eventId: string | null): Promise<void> {
		if (!eventId) {
			this.rows = [];
			this.loadedFor = null;
			return;
		}
		if (eventId === this.loadedFor) return;
		this.loadedFor = eventId;
		this.loading = true;
		try {
			const result = await this.api.listForEvent(eventId);
			if (result.ok) this.rows = result.data.tasks;
		} finally {
			this.loading = false;
		}
	}

	/** The parent re-reads its own pending list; the checklist follows it. */
	syncPending(titles: readonly string[]): void {
		const same =
			titles.length === this.pending.length &&
			titles.every((title, i) => title === this.pending[i]);
		if (!same) this.pending = [...titles];
	}

	/** Add the typed title: queued in create mode, POSTed once the Event exists. */
	async add(): Promise<void> {
		const title = this.draftTitle.trim();
		if (!title || this.busy) return;
		if (this.loadedFor === null) {
			this.pending = [...this.pending, title];
			this.onPendingTitlesChange([...this.pending]);
			this.draftTitle = '';
			return;
		}
		await this.createRow(title);
	}

	private async createRow(title: string): Promise<void> {
		const eventId = this.loadedFor;
		if (!eventId) return;
		this.busy = true;
		this.error = '';
		try {
			const result = await this.api.create({ title, eventId });
			if (!result.ok) {
				this.error = result.error;
				return;
			}
			this.rows = [...this.rows, result.data.task];
			this.draftTitle = '';
		} finally {
			this.busy = false;
		}
	}

	/** Remove a queued title in create mode. */
	removePending(index: number): void {
		this.pending = this.pending.filter((_, i) => i !== index);
		this.onPendingTitlesChange([...this.pending]);
	}

	async toggle(taskId: string): Promise<void> {
		if (this.busy) return;
		this.busy = true;
		try {
			const result = await this.api.update(taskId, { toggleComplete: true });
			if (result.ok) {
				const updated = result.data.task;
				this.rows = this.rows.map((row) => (row.id === taskId ? { ...row, ...updated } : row));
			}
		} finally {
			this.busy = false;
		}
	}

	async remove(taskId: string): Promise<void> {
		if (this.busy) return;
		this.busy = true;
		try {
			const result = await this.api.remove(taskId);
			if (result.ok) this.rows = this.rows.filter((row) => row.id !== taskId);
		} finally {
			this.busy = false;
		}
	}

	closeInput(): void {
		this.showInput = false;
		this.draftTitle = '';
		this.error = '';
	}
}
