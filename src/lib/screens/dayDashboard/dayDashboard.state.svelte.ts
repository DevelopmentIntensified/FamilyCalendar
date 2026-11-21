/**
 * dayDashboard state — the three writes the Day Dashboard cards make: the
 * board's quick-add, a Task's complete toggle (with the recurring Undo) and a
 * priority change. Optimistic flags, rollback-free re-read and the toast copy
 * live here; the cards only render and call.
 *
 * No DOM, no `$app/*`: the api, the toaster and `refresh` arrive in the
 * constructor, so the class is tested in node with a fake api and memory
 * toasts (`port-ui.md`). Legacy homes: the three cards' inline `fetch` calls
 * (`FamilyTaskBoardCard.svelte`, `TopPrioritiesCard.svelte`).
 *
 * Doc: ./README.md#public-interface
 */
import type { ToastAction, Toasts } from '$lib/kernel/client/toasts.svelte';
import { systemClock } from '$lib/kernel/time/clock';
import { parseTaskQuickAdd } from '$lib/domains/parsing';
import { taskQuickAddRefusal, taskRecurringCompleteText, type TasksApi } from '$lib/domains/tasks';
import { familyBoardTaskBody } from './dayDashboard.cards.rules';
import type {
	DashboardFamilyTaskRow,
	DashboardRosterRow,
	DashboardUserTaskRow
} from './dayDashboard.contract';

/** The undo failure copy the tasks page already ships (one wording, two screens). */
const UNDO_CHANGED = "Couldn't undo — the task may have changed. Refresh and try again.";
const UNDO_OFFLINE = "Couldn't undo — check your connection and try again.";

/** One Task the cards can write: the fields the toasts and the body read. */
export type DashboardWritableTask = Pick<
	DashboardUserTaskRow | DashboardFamilyTaskRow,
	'id' | 'title' | 'dueDate' | 'recurrenceFrequency'
>;

export type DayDashboardStateOptions = {
	/** The tasks browser client; a fake in tests. */
	readonly api: TasksApi;
	readonly toasts: Toasts;
	/** SvelteKit `invalidateAll`, passed in by the screen. */
	readonly refresh: () => Promise<void>;
	/** The family roster the `@member` grammar resolves against. */
	readonly roster: readonly DashboardRosterRow[];
	/** The family a board quick-add files to. */
	readonly familyId: string;
	readonly meId: string;
	/** The viewer's stored zone — parsed due dates land at 23:59 there. */
	readonly zone: string;
	readonly clock?: () => Date;
};

export class DayDashboardState {
	/** The board's quick-add input, kept on a refusal so the user can fix it. */
	quickTitle = $state('');
	quickCategory = $state('');
	/** The inline refusal (`@member` unknown, `@family` without a family). */
	quickError = $state('');
	quickBusy = $state(false);
	/** The Task a write is in flight for; its buttons disable. */
	busyTaskId = $state<string | null>(null);

	private readonly api: TasksApi;
	private readonly toasts: Toasts;
	private readonly refresh: () => Promise<void>;
	/** The roster the `@member` grammar resolves against; the streamed load fills it. */
	private roster: readonly DashboardRosterRow[];
	private readonly familyId: string;
	private readonly meId: string;
	/** The viewer's stored zone — parsed due dates land at 23:59 there. */
	private readonly zone: string;
	private readonly clock: () => Date;

	constructor(options: DayDashboardStateOptions) {
		this.api = options.api;
		this.toasts = options.toasts;
		this.refresh = options.refresh;
		this.roster = options.roster;
		this.familyId = options.familyId;
		this.meId = options.meId;
		this.zone = options.zone;
		this.clock = options.clock ?? systemClock.now;
	}

	/** Adopt the roster the streamed band resolved with (the page calls this once). */
	setRoster(members: readonly DashboardRosterRow[]): void {
		this.roster = members;
	}

	/** The members the quick-add grammar resolves `@name` against. */
	private get members() {
		return this.roster.map((member) => ({
			userId: member.userId,
			firstName: member.firstName,
			lastName: member.lastName
		}));
	}

	/**
	 * The board's quick-add: parse, refuse an unmatched `@member` inline (the
	 * input is kept, never silently dropped), then create the Family Task and
	 * name it in the toast.
	 */
	async addFamilyTask(): Promise<void> {
		const title = this.quickTitle.trim();
		if (!title || this.quickBusy) return;
		const parsed = parseTaskQuickAdd(this.quickTitle, {
			now: this.clock(),
			zone: this.zone,
			members: this.members
		});
		const refusal = taskQuickAddRefusal(parsed, this.familyId);
		if (refusal) {
			this.quickError = refusal;
			return;
		}
		this.quickError = '';
		this.quickBusy = true;
		const result = await this.api.create(
			familyBoardTaskBody(parsed, {
				familyId: this.familyId,
				meId: this.meId,
				category: this.quickCategory
			})
		);
		this.quickBusy = false;
		if (!result.ok) {
			this.toasts.error(result.error);
			return;
		}
		this.quickTitle = '';
		this.quickCategory = '';
		this.toasts.success(`Added "${parsed.title}" to the family board.`);
		await this.refresh();
	}

	/**
	 * Toggle one Task's completion. A recurring check-off gets ONLY the
	 * streak+Undo toast; a one-off says it was marked done. The early return on
	 * a network failure keeps the input state as it was.
	 */
	async toggleTask(task: DashboardWritableTask): Promise<void> {
		if (this.busyTaskId) return;
		this.busyTaskId = task.id;
		const previousDueDate = task.dueDate;
		const result = await this.api.update(task.id, { toggleComplete: true });
		this.busyTaskId = null;
		if (!result.ok) {
			this.toasts.error(result.error);
			return;
		}
		await this.refresh();
		if (!task.recurrenceFrequency) {
			this.toasts.success(`"${task.title}" marked done.`);
			return;
		}
		const action: ToastAction = {
			label: 'Undo',
			run: () => {
				void this.undoCompletion(task.id, previousDueDate);
			}
		};
		this.toasts.success(taskRecurringCompleteText(result.data.task, this.clock()), action);
	}

	/** Put a recurring completion back: the cursor, the count and the history row. */
	async undoCompletion(taskId: string, previousDueDate: string | null): Promise<void> {
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

	/** The priorities a card can set, in the row's own order. */
	async setPriority(
		task: DashboardWritableTask,
		priority: 'normal' | 'high' | 'low'
	): Promise<void> {
		if (this.busyTaskId) return;
		this.busyTaskId = task.id;
		const result = await this.api.update(task.id, {
			priority
		});
		this.busyTaskId = null;
		if (!result.ok) {
			this.toasts.error(result.error);
			return;
		}
		await this.refresh();
		const label =
			priority === 'high' ? 'High' : priority === 'low' ? 'Low' : priority === 'normal' ? 'Normal' : priority;
		this.toasts.success(`Priority for "${task.title}" set to ${label}.`);
	}
}
