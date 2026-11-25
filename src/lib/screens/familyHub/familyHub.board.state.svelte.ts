/**
 * familyHub board state — the `/family/tasks` page's behaviour: the two tabs,
 * the tag filter, the per-task pending flag, the accept/decline and
 * complete/skip/delete feedback, the owner-only edit sheet, and the columns and
 * empty state the screen renders.
 *
 * No `$effect` and no DOM: side effects are explicit methods, the api and the
 * toasts are injected, and the clock is passed in, so the class is tested in
 * node with a fake api (`port-ui.md`). Toasts carry the legacy copy
 * (`family/tasks/+page.svelte`, `utils/familyTaskActions.ts`,
 * `client/taskEditSave.ts` and `client/taskFeedback.ts`).
 *
 * Doc: ./README.md#invariants
 */
import type { Toasts } from '$lib/kernel/client/toasts.svelte';
import { systemClock } from '$lib/kernel/time/clock';
import type { TasksApi, TaskUpdatePayload } from '$lib/domains/tasks/index';
import {
	buildTaskEditPayload,
	formatTaskDue,
	groupFamilyBoard,
	matchesTaskTagFilter,
	taskLateChip,
	taskRecurringCompleteText,
	taskRecurringSkipText,
	type FamilyBoardColumn,
	type TaskEditDraft
} from '$lib/domains/tasks/index';
import type { FamilyBoardModel, FamilyBoardTask } from './familyHub.contract';
import {
	boardEmptyState,
	pendingForViewer,
	publicTabLabel,
	type BoardTab
} from './familyHub.board.rules';

export type FamilyBoardStateOptions = {
	readonly api: TasksApi;
	readonly toasts: Toasts;
	/** Re-reads the page's load data (SvelteKit `invalidateAll`). */
	readonly refresh: () => Promise<void>;
	readonly data: FamilyBoardModel;
	/** The clock, for urgency order, late chips and recurring toasts (R5). */
	readonly clock?: () => Date;
};

export class FamilyBoardState {
	tab = $state<BoardTab>('family');
	tagFilter = $state('');
	/** The Task whose mutation is in flight; one at a time, as the page always did. */
	busyId = $state<string | null>(null);
	/** The owner-only edit sheet's target. */
	editing = $state<FamilyBoardTask | null>(null);
	editSaving = $state(false);
	/** The row whose inline "Delete …?" ask is open. */
	confirmDeleteId = $state<string | null>(null);
	/** The server's rows; the page re-reads into this after every write. */
	private current = $state.raw<FamilyBoardModel | null>(null);

	get data(): FamilyBoardModel {
		if (!this.current) throw new Error('FamilyBoardState: data was never set');
		return this.current;
	}

	set data(next: FamilyBoardModel) {
		this.current = next;
	}

	private readonly api: TasksApi;
	private readonly toasts: Toasts;
	private readonly refresh: () => Promise<void>;
	private readonly clock: () => Date;

	constructor(options: FamilyBoardStateOptions) {
		this.api = options.api;
		this.toasts = options.toasts;
		this.refresh = options.refresh;
		this.clock = options.clock ?? systemClock.now;
		this.data = options.data;
	}

	// --- Rows -----------------------------------------------------------------

	/** The roster name for an id; "You" for the viewer, the id stub otherwise. */
	memberName(userId: string): string {
		if (userId === this.data.userId) return 'You';
		const member = this.data.familyRoster.find((row) => row.userId === userId);
		return member ? `${member.firstName} ${member.lastName}`.trim() : userId.slice(0, 8);
	}

	/** The Public tab's rows: other members' public personal Tasks, read-only. */
	publicTasks = $derived(this.data.publicTasks);

	/** Open family Tasks left after the tag filter — the columns and Nobody card. */
	openTasks = $derived(
		this.data.tasks.filter(
			(task) => !task.completedAt && matchesTaskTagFilter(task.tags, this.tagFilter)
		)
	);

	/** Completed family Tasks left after the tag filter — the completed list. */
	completedTasks = $derived(
		this.data.tasks.filter(
			(task) => !!task.completedAt && matchesTaskTagFilter(task.tags, this.tagFilter)
		)
	);

	/** The approved "Nobody" card: a Task with no assignee belongs to no column. */
	unassignedTasks = $derived(this.openTasks.filter((task) => !task.assignedTo));

	/** One card per assignee, viewer first; unassigned rows are the Nobody card. */
	boardGroups = $derived.by(
		(): FamilyBoardColumn<FamilyBoardTask>[] =>
			groupFamilyBoard(
				this.openTasks.filter((task) => !!task.assignedTo),
				{
					viewerId: this.data.userId,
					nameFor: (ownerId) => this.memberName(ownerId),
					now: this.clock()
				}
			)
	);

	/** Handoffs waiting for this viewer, counted above the board. */
	pendingForMe = $derived(pendingForViewer(this.openTasks, this.data.userId));

	/** Which of the five states the active tab renders. */
	emptyState = $derived(
		boardEmptyState({
			tab: this.tab,
			open: this.openTasks.length,
			completed: this.completedTasks.length,
			publicCount: this.publicTasks.length,
			tagFilter: this.tagFilter
		})
	);

	/** The Public tab's label, count included. */
	publicLabel = $derived(publicTabLabel(this.publicTasks.length));

	/** Q-091's true completed count, as the heading prints it. */
	completedTotal = $derived(this.data.completedTotal);

	/** The due chip's label at `now`, or '' for an undated row. */
	dueLabel(task: FamilyBoardTask): string {
		return formatTaskDue(task.dueDate, this.clock());
	}

	/** The row's late chip, or null when it is not overdue. */
	lateChip(task: FamilyBoardTask): string | null {
		return taskLateChip(task.dueDate, this.clock());
	}

	/** The editor's category suggestions: names only, as the legacy dialog took them. */
	categoryNames = $derived(this.data.taskCategories.map((category) => category.name));

	// --- Filters and tabs -----------------------------------------------------

	setTab(tab: BoardTab): void {
		this.tab = tab;
	}

	setTagFilter(value: string): void {
		this.tagFilter = value;
	}

	// --- Task writes ----------------------------------------------------------

	/** Mark the Task done; a recurring one answers with its next occurrence. */
	async toggle(task: FamilyBoardTask): Promise<void> {
		if (this.busyId) return;
		this.busyId = task.id;
		const payload: TaskUpdatePayload = { toggleComplete: true };
		const result = await this.api.update(task.id, payload);
		this.busyId = null;
		if (!result.ok) {
			this.toasts.error(result.error);
			return;
		}
		await this.refresh();
		if (result.data.task.recurrenceFrequency) {
			this.toasts.success(taskRecurringCompleteText(result.data.task, this.clock()));
		}
	}

	/** Skip a recurring occurrence: cursor only, explicitly not counted. */
	async advance(task: FamilyBoardTask): Promise<void> {
		if (this.busyId) return;
		this.busyId = task.id;
		const payload: TaskUpdatePayload = { advanceToNext: true };
		const result = await this.api.update(task.id, payload);
		this.busyId = null;
		if (!result.ok) {
			this.toasts.error(result.error);
			return;
		}
		await this.refresh();
		this.toasts.info(taskRecurringSkipText(result.data.task, this.clock()));
	}

	/** Accept moves the Task to the viewer's list; decline returns it to the assigner. */
	async respond(task: FamilyBoardTask, accept: boolean): Promise<void> {
		if (this.busyId) return;
		this.busyId = task.id;
		const payload: TaskUpdatePayload = {
			assignmentStatus: accept ? 'accepted' : 'declined'
		};
		const result = await this.api.update(task.id, payload);
		this.busyId = null;
		if (!result.ok) {
			this.toasts.error(result.error);
			return;
		}
		this.toasts.success(
			accept ? `Accepted "${task.title}" — it's on your list.` : `Declined "${task.title}".`
		);
		await this.refresh();
	}

	/** The edit sheet is owner-only, as the row's edit trigger was. */
	openEdit(task: FamilyBoardTask): void {
		if (this.busyId || task.userId !== this.data.userId) return;
		this.editing = task;
	}

	closeEdit(): void {
		this.editing = null;
	}

	/** Save the shared editor's draft: close and say so, or keep it open and explain. */
	async saveEdit(draft: TaskEditDraft): Promise<void> {
		const editing = this.editing;
		if (!editing || !draft.title.trim() || this.editSaving) return;
		const title = draft.title.trim();
		this.editSaving = true;
		const result = await this.api.update(
			editing.id,
			buildTaskEditPayload(editing, draft, this.data.userId)
		);
		this.editSaving = false;
		if (!result.ok) {
			const reason = result.status === 0 ? 'check your connection.' : result.error;
			this.toasts.error(`Couldn't save "${title}" — ${reason}`);
			return;
		}
		this.toasts.success(`Saved "${result.data.task.title || title}".`);
		this.editing = null;
		await this.refresh();
	}

	/** Begin the inline delete ask on a row the viewer owns. */
	beginDelete(task: FamilyBoardTask): void {
		if (this.busyId || task.userId !== this.data.userId) return;
		this.confirmDeleteId = task.id;
	}

	cancelDelete(): void {
		this.confirmDeleteId = null;
	}

	async remove(task: FamilyBoardTask): Promise<void> {
		if (this.busyId || task.userId !== this.data.userId) return;
		this.busyId = task.id;
		const result = await this.api.remove(task.id);
		this.busyId = null;
		this.confirmDeleteId = null;
		if (!result.ok) {
			this.toasts.error(result.error);
			return;
		}
		this.toasts.success(`Deleted "${task.title}".`);
		await this.refresh();
	}
}
