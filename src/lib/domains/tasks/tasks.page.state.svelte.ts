/**
 * tasks page state — the `/calendar/tasks` screen's behaviour: the chips,
 * search, sort and jump-bar state, the per-id optimistic completion override,
 * the focus start/stop with its 4 s settle, the category manager's optimistic
 * rename/delete, the editor sheet's save, and every toast the page prints.
 *
 * No `$effect` and no DOM: side effects are explicit methods and the clock is
 * passed in, so the class is tested in node with a fake api (`port-ui.md`).
 * Timers go through the kernel scheduler port.
 *
 * Legacy homes folded in: the page's script (`+page.svelte:1-419`),
 * `client/taskFeedback.ts`, `client/taskFocus.ts`, `client/taskEditSave.ts`,
 * `client/taskCategories.ts`, `utils/familyTaskActions.ts` and
 * `components/tasks/TaskCategoryManager.svelte`'s optimistic list.
 */

import { localPref } from '$lib/kernel/client/localPref';
import { queueMutation } from '$lib/kernel/client/offlineQueue';
import type { ToastAction, Toasts } from '$lib/kernel/client/toasts.svelte';
import { systemClock } from '$lib/kernel/time/clock';
import { systemScheduler, type Scheduler } from '$lib/kernel/time/scheduler';
import type { TasksApi } from './tasks.api';
import type { TaskCategoryItem, TaskPageRow, TaskRosterMember, TaskSections } from './tasks.contract';
import {
	buildTaskEditPayload,
	type TaskEditDraft
} from './tasks.editor.rules';
import {
	taskRecurringCompleteText,
	taskRecurringSkipText
} from './tasks.display.rules';
import {
	matchesTaskChip,
	matchesTaskSearch,
	matchesTaskTagFilter,
	sortTaskRows,
	splitTasksByRecurrence,
	taskBucketCounts,
	taskInOwnerView,
	taskMemberName,
	taskUrgencyBucket,
	countTasksCompletedThisWeek,
	TASK_SORT_KEYS,
	TASK_TIME_FILTERS,
	type TaskChip,
	type TaskOwnerView,
	type TaskSortKey,
	type TaskTimeFilter
} from './tasks.list.rules';

/** The desktop clocks its queue within seconds; the phone waits 4 s too (#290). */
export const FOCUS_SETTLE_MS = 4_000;

const SORT_KEY = 'familyplanz:tasksSortBy';
const TAG_FILTER_KEY = 'familyplanz:tagFilter';
const PREF_VERSION = 1;
const UNDO_CHANGED = "Couldn't undo — the task may have changed. Refresh and try again.";
const UNDO_OFFLINE = "Couldn't undo — check your connection and try again.";

const isSortKey = (raw: unknown): raw is TaskSortKey =>
	typeof raw === 'string' && TASK_SORT_KEYS.some((entry) => entry.value === raw);
const isString = (raw: unknown): raw is string => typeof raw === 'string';

type PrefStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type TasksStateOptions = {
	readonly api: TasksApi;
	readonly toasts: Toasts;
	/** Re-reads the page's load data (SvelteKit `invalidateAll`). */
	readonly refresh: () => Promise<void>;
	readonly sections: TaskSections;
	/** Labels of the page's own load legs that degraded (the layout's warnings). */
	readonly loadWarnings?: readonly string[];
	readonly categories: readonly TaskCategoryItem[];
	readonly roster: readonly TaskRosterMember[];
	readonly currentUserId: string | undefined;
	/** The clock, for due buckets and toasts (R5). */
	readonly clock?: () => Date;
	readonly schedule?: Scheduler;
	readonly storage?: PrefStorage | null;
};

export class TasksPageState {
	/** Server rows, plus rows the quick-add added optimistically. */
	private serverRows = $state<TaskPageRow[]>([]);
	private addedRows = $state<TaskPageRow[]>([]);
	/** Pending / requested assignment queues, straight from the load. */
	pendingAssignments = $state<TaskPageRow[]>([]);
	requestedByMe = $state<TaskPageRow[]>([]);
	/** Legs of the load that degraded, named by the read. */
	warnings = $state<string[]>([]);
	/** TaskId → optimistic completion state while a toggle is in flight. */
	private completedOverride = $state<Record<string, boolean>>({});
	/**
	 * TaskFocus runs one open span per user, so a single override is enough:
	 * the tapped row flips now, the team re-read drops it after the settle.
	 */
	private focusOverride = $state<{ id: string; startedAt: string | null } | null>(null);

	chip = $state<TaskChip>('all');
	view = $state<TaskOwnerView>('open');
	timeFilter = $state<TaskTimeFilter>('all');
	searchQuery = $state('');
	sortBy = $state<TaskSortKey>('urgency');
	tagFilter = $state('');
	busyId = $state<string | null>(null);
	focusBusyId = $state<string | null>(null);
	celebratingId = $state<string | null>(null);
	clearBusy = $state(false);
	editing = $state<TaskPageRow | null>(null);
	editSaving = $state(false);
	categories = $state<TaskCategoryItem[]>([]);
	/** The inline banner text (`role="alert"` above the list). */
	error = $state('');

	private readonly api: TasksApi;
	private readonly toasts: Toasts;
	private readonly refresh: () => Promise<void>;
	private readonly roster: readonly TaskRosterMember[];
	private readonly currentUserId: string | undefined;
	private readonly clock: () => Date;
	private readonly schedule: Scheduler;
	private readonly sortPref: ReturnType<typeof localPref<TaskSortKey>>;
	private readonly tagPref: ReturnType<typeof localPref<string>>;
	private celebrateCancel: (() => void) | null = null;
	private settleCancel: (() => void) | null = null;

	constructor(options: TasksStateOptions) {
		this.api = options.api;
		this.toasts = options.toasts;
		this.refresh = options.refresh;
		this.roster = options.roster;
		this.currentUserId = options.currentUserId;
		this.clock = options.clock ?? systemClock.now;
		this.schedule = options.schedule ?? systemScheduler;
		this.sortPref = localPref({
			key: SORT_KEY,
			version: PREF_VERSION,
			fallback: 'urgency' as TaskSortKey,
			parse: (raw) => (isSortKey(raw) ? raw : null),
			storage: options.storage
		});
		this.tagPref = localPref({
			key: TAG_FILTER_KEY,
			version: PREF_VERSION,
			fallback: '',
			parse: (raw) => (isString(raw) ? raw : null),
			storage: options.storage
		});
		this.serverRows = [...options.sections.myTasks].map(normalizeDueShapes);
		this.pendingAssignments = [...options.sections.pendingAssignments];
		this.requestedByMe = [...options.sections.requestedByMe];
		this.warnings = [
			...new Set([...options.sections.warnings, ...(options.loadWarnings ?? [])])
		];
		this.categories = [...options.categories];
		this.sortBy = this.sortPref.read();
		this.tagFilter = this.tagPref.read();
	}

	// --- Row access -----------------------------------------------------------

	/** The roster name for a user id; `You` for the viewer, the id stub otherwise. */
	memberName = (userId: string): string =>
		taskMemberName(
			this.roster.find((member) => member.userId === userId),
			userId,
			this.currentUserId
		);

	/** Every row, the focus override applied — the row renders what it is told. */
	allRows = $derived.by((): TaskPageRow[] => {
		const serverIds = new Set(this.serverRows.map((row) => row.id));
		const merged = [
			...this.addedRows.filter((row) => !serverIds.has(row.id)),
			...this.serverRows
		];
		const override = this.focusOverride;
		if (!override) return merged;
		return merged.map((row) =>
			row.id === override.id
				? { ...row, focusStartedAt: override.startedAt }
				: row
		);
	});

	private completedOf(row: TaskPageRow): boolean {
		return row.id in this.completedOverride ? this.completedOverride[row.id] : !!row.completedAt;
	}

	openTasks = $derived(this.allRows.filter((row) => !this.completedOf(row)));
	completedTasks = $derived(this.allRows.filter((row) => this.completedOf(row)));

	/** Chip + tag + search, applied to each half. */
	filteredOpen = $derived(this.openTasks.filter((row) => this.passesFilters(row)));
	filteredDone = $derived(this.completedTasks.filter((row) => this.passesFilters(row)));

	/** What the chips/search/tag filter and the owner axis left, in list order. */
	visibleOpen = $derived(
		this.view === 'done' ? [] : this.filteredOpen.filter((row) => this.inView(row))
	);
	visibleDone = $derived(this.filteredDone.filter((row) => this.inView(row)));
	matched = $derived([...this.visibleOpen, ...this.visibleDone]);
	counts = $derived(taskBucketCounts(this.matched, this.clock()));
	rows = $derived(
		this.matched
			.filter(
				(row) =>
					this.timeFilter === 'all' ||
					taskUrgencyBucket(row, this.clock()) === this.timeFilter
			)
			.sort((a, b) => sortTaskRows(a, b, this.sortBy, this.clock()))
	);
	split = $derived(splitTasksByRecurrence(this.rows));
	completedThisWeek = $derived(countTasksCompletedThisWeek(this.completedTasks, this.clock()));

	tagFilterActive = $derived(this.tagFilter.trim().length > 0);
	queryActive = $derived(this.searchQuery.trim().length > 0);
	chipActive = $derived(this.chip !== 'all');
	viewActive = $derived(this.view !== 'open');
	timeActive = $derived(this.timeFilter !== 'all');
	anyFilterActive = $derived(
		this.tagFilterActive || this.queryActive || this.chipActive || this.viewActive || this.timeActive
	);

	// --- Filters --------------------------------------------------------------

	private passesFilters(row: TaskPageRow): boolean {
		return (
			matchesTaskChip(row, this.chip) &&
			matchesTaskTagFilter(row.tags, this.tagFilter) &&
			matchesTaskSearch(row, this.searchQuery, this.memberName)
		);
	}

	private inView(row: TaskPageRow): boolean {
		return taskInOwnerView(row, this.view, this.currentUserId);
	}

	setChip(chip: TaskChip): void {
		this.chip = chip;
	}

	setView(view: TaskOwnerView): void {
		this.view = view;
	}

	setTimeFilter(filter: TaskTimeFilter): void {
		this.timeFilter = filter;
	}

	setSearchQuery(query: string): void {
		this.searchQuery = query;
	}

	setSortBy(key: TaskSortKey): void {
		this.sortBy = key;
		this.sortPref.write(key);
	}

	setTagFilter(filter: string): void {
		this.tagFilter = filter;
		this.tagPref.write(filter);
	}

	/** The label the jump bar and the active-filter line print. */
	timeFilterLabel = (filter: TaskTimeFilter): string =>
		TASK_TIME_FILTERS.find((entry) => entry.value === filter)?.label ?? '';

	dismissError(): void {
		this.error = '';
	}

	/** The quick-add's optimistic insert; the next re-read reconciles it. */
	addTask(row: TaskPageRow): void {
		this.addedRows = [normalizeDueShapes(row), ...this.addedRows];
	}

	/** The manager overlays the load's list; a new server list replaces it. */
	syncCategories(categories: readonly TaskCategoryItem[]): void {
		const same =
			categories.length === this.categories.length &&
			categories.every(
				(category, i) =>
					category.id === this.categories[i]?.id && category.name === this.categories[i]?.name
			);
		if (!same) this.categories = [...categories];
	}

	/**
	 * A re-read (`invalidateAll`) hands the Screen new load data; the state
	 * adopts the queues and warnings it did not receive through a method.
	 * The main list arrives through `refresh`'s own load, so only these move.
	 */
	syncSections(sections: TaskSections, loadWarnings: readonly string[]): void {
		this.serverRows = [...sections.myTasks].map(normalizeDueShapes);
		this.pendingAssignments = [...sections.pendingAssignments];
		this.requestedByMe = [...sections.requestedByMe];
		this.warnings = [...new Set([...sections.warnings, ...loadWarnings])];
	}

	// --- Completion -----------------------------------------------------------

	private clearOverride(taskId: string): void {
		const next = { ...this.completedOverride };
		delete next[taskId];
		this.completedOverride = next;
	}

	private celebrate(taskId: string): void {
		this.celebrateCancel?.();
		this.celebratingId = taskId;
		if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.(15);
		this.celebrateCancel = this.schedule(() => {
			this.celebratingId = null;
		}, 900);
	}

	private taskById(taskId: string): TaskPageRow | undefined {
		return this.allRows.find((row) => row.id === taskId);
	}

	/** Toggle one Task: optimistic flip, re-read, then the feedback toast. */
	async toggle(taskId: string): Promise<void> {
		if (this.busyId) return;
		const task = this.taskById(taskId);
		if (!task) return;
		const completing = !this.completedOf(task);
		const previousDueDate = task.dueDate;
		this.busyId = taskId;
		this.error = '';
		this.completedOverride = { ...this.completedOverride, [taskId]: completing };
		const result = await this.api.update(taskId, { toggleComplete: true });
		this.busyId = null;
		if (!result.ok) {
			if (result.status === 0) {
				// Network error: replay when back online, keep the optimistic row.
				await queueMutation(`/api/tasks/${taskId}`, 'PUT', { toggleComplete: true });
				return;
			}
			this.error = result.error;
			this.clearOverride(taskId);
			return;
		}
		const updated = result.data.task;
		await this.refresh();
		this.clearOverride(taskId);
		if (!completing) return;
		this.celebrate(taskId);
		if (updated.recurrenceFrequency) {
			const action: ToastAction = {
				label: 'Undo',
				run: () => {
					void this.undo(taskId, previousDueDate);
				}
			};
			this.toasts.success(taskRecurringCompleteText(updated, this.clock()), action);
			return;
		}
		this.toasts.success(`"${task.title}" marked done.`);
	}

	/** Undo a recurring completion: restore the cursor, count and history row. */
	private async undo(taskId: string, previousDueDate: string | null): Promise<void> {
		const result = await this.api.update(taskId, {
			undoComplete: true,
			previousDueDate: previousDueDate ?? null
		});
		if (!result.ok) {
			this.toasts.error(result.status === 0 ? UNDO_OFFLINE : UNDO_CHANGED);
			return;
		}
		await this.refresh();
		this.toasts.success('↩️ Undone — back to the previous occurrence.');
	}

	/** Skip a recurring occurrence: cursor only, explicitly not counted. */
	async skip(taskId: string): Promise<void> {
		if (this.busyId) return;
		this.busyId = taskId;
		this.error = '';
		const result = await this.api.update(taskId, { advanceToNext: true });
		this.busyId = null;
		if (!result.ok) {
			this.error = result.error;
			return;
		}
		await this.refresh();
		this.toasts.info(taskRecurringSkipText(result.data.task, this.clock()));
	}

	// --- TaskFocus ------------------------------------------------------------

	private focusStartedAtOf(row: TaskPageRow): string | null {
		if (this.focusOverride && this.focusOverride.id === row.id) return this.focusOverride.startedAt;
		const value = row.focusStartedAt;
		if (!value) return null;
		const at = value instanceof Date ? value.getTime() : new Date(value).getTime();
		return Number.isNaN(at) ? null : new Date(at).toISOString();
	}

	/**
	 * One tap starts the desktop clock on this Task; while it runs the same
	 * control stops it. Minutes are never written here — the clock owns them
	 * and the re-read after the settle brings them back.
	 */
	async toggleFocus(task: TaskPageRow): Promise<void> {
		if (this.focusBusyId) return;
		const stop = this.focusStartedAtOf(task) !== null;
		this.focusBusyId = task.id;
		this.error = '';
		const result = await this.api.focusCommand(stop ? 'stop' : 'start', stop ? undefined : task.id);
		this.focusBusyId = null;
		if (!result.ok) {
			this.error =
				result.status === 404 || result.status === 405
					? "This server can't start focus yet."
					: result.error;
			return;
		}
		this.toasts.success(stop ? 'Asked TaskFocus to stop focus.' : 'Asked TaskFocus to start focus.');
		this.focusOverride = {
			id: task.id,
			startedAt: stop ? null : this.clock().toISOString()
		};
		this.settleCancel?.();
		this.settleCancel = this.schedule(() => {
			void this.refresh().then(() => {
				if (this.focusOverride?.id === task.id) this.focusOverride = null;
			});
		}, FOCUS_SETTLE_MS);
	}

	// --- Assignments ----------------------------------------------------------

	/** Accept or decline a handoff; the server answers the new status. */
	async respond(task: Pick<TaskPageRow, 'id' | 'title'>, accept: boolean): Promise<void> {
		if (this.busyId) return;
		this.busyId = task.id;
		this.error = '';
		const result = await this.api.update(task.id, {
			assignmentStatus: accept ? 'accepted' : 'declined'
		});
		this.busyId = null;
		if (!result.ok) {
			this.error = result.error;
			return;
		}
		this.toasts.success(
			accept
				? `Accepted "${task.title}" — it's on your list.`
				: `Declined "${task.title}" — sent back to the requester.`
		);
		await this.refresh();
	}

	// --- Delete and clear -----------------------------------------------------

	async remove(taskId: string): Promise<void> {
		if (this.busyId) return;
		const gone = this.taskById(taskId);
		this.busyId = taskId;
		this.error = '';
		const result = await this.api.remove(taskId);
		this.busyId = null;
		if (!result.ok) {
			this.error = result.error;
			return;
		}
		this.toasts.success(`Deleted "${gone?.title ?? 'Task'}".`);
		await this.refresh();
	}

	/** One DELETE, even on a double tap: the guard is the busy flag. */
	async clearCompleted(): Promise<void> {
		if (this.clearBusy) return;
		this.clearBusy = true;
		this.error = '';
		const result = await this.api.clearCompleted();
		this.clearBusy = false;
		if (!result.ok) {
			if (result.status === 0) {
				await queueMutation('/api/tasks/completed', 'DELETE', null);
				return;
			}
			this.error = result.error;
			return;
		}
		this.toasts.success('Completed tasks cleared — fresh start.');
		await this.refresh();
	}

	// --- Editor ---------------------------------------------------------------

	openEditor(task: TaskPageRow): void {
		if (this.busyId) return;
		this.editing = task;
	}

	closeEditor(): void {
		this.editing = null;
	}

	/** PUT the draft; the sheet closes only on success and the toast names it. */
	async saveEdit(draft: TaskEditDraft): Promise<void> {
		const editing = this.editing;
		if (!editing || !draft.title.trim() || this.editSaving) return;
		const title = draft.title.trim();
		this.editSaving = true;
		this.error = '';
		const result = await this.api.update(
			editing.id,
			buildTaskEditPayload(editing, draft, this.currentUserId)
		);
		this.editSaving = false;
		if (!result.ok) {
			const reason = result.status === 0 ? 'check your connection.' : result.error;
			if (result.status !== 0) this.error = result.error;
			this.toasts.error(`Couldn't save "${title}" — ${reason}`);
			return;
		}
		const saved = result.data.task.title || title;
		this.toasts.success(`Saved "${saved}".`);
		this.editing = null;
		await this.refresh();
	}

	// --- Category manager -----------------------------------------------------

	/** Optimistic rename: the list changes on click, rolls back on refusal. */
	async renameCategory(categoryId: string, name: string): Promise<void> {
		const before = this.categories;
		const category = before.find((entry) => entry.id === categoryId);
		if (!category || name === category.name) return;
		this.error = '';
		this.categories = before
			.map((entry) => (entry.id === categoryId ? { ...entry, name } : entry))
			.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
		const result = await this.api.renameCategory(categoryId, name);
		if (!result.ok) {
			this.categories = before;
			this.error = result.error;
			this.toasts.error(`Couldn't rename "${category.name}": ${result.error}`);
			return;
		}
		this.toasts.success(
			`Renamed "${category.name}" to "${result.data.category.name}" — your tasks moved with it.`
		);
		await this.refresh();
	}

	/** Optimistic delete; a 404 means it is already gone, which is the goal. */
	async removeCategory(categoryId: string): Promise<void> {
		const before = this.categories;
		const category = before.find((entry) => entry.id === categoryId);
		if (!category) return;
		this.error = '';
		this.categories = before.filter((entry) => entry.id !== categoryId);
		const result = await this.api.removeCategory(categoryId);
		if (!result.ok && result.status !== 404) {
			this.categories = before;
			this.error = result.error;
			this.toasts.error(`Couldn't delete "${category.name}": ${result.error}`);
			return;
		}
		this.toasts.success(`Deleted "${category.name}" — its tasks are now uncategorized.`);
		await this.refresh();
	}
}

/** The due columns arrive as strings on the wire but a Date after devalue. */
function normalizeDueShapes(row: TaskPageRow): TaskPageRow {
	const startedAt = row.focusStartedAt;
	if (!startedAt || typeof startedAt === 'string') return row;
	return { ...row, focusStartedAt: startedAt.toISOString() };
}
