<!--
	Family Task Board: the header line (the BOARD's open total · streak), the
	`@member` quick-add with its category field and inline refusal, and one
	column per person — the union of the rows' owners and the roster, an empty
	column saying "nothing assigned".

	Writes go through the screen's state class. Legacy reference:
	`components/dashboard/FamilyTaskBoardCard.svelte` (101/240/283).
-->
<script lang="ts">
	import MentionInput from '$lib/kernel/ui/MentionInput.svelte';
	import { idColor } from '$lib/kernel/ui/colorHash';
	import { groupFamilyBoard, taskPriorityDot } from '$lib/domains/tasks';
	import BoardCategoryField from './BoardCategoryField.svelte';
	import type { DashboardFamilyTaskRow, DashboardRosterRow } from '../dayDashboard.contract';
	import { dashboardDueTone } from '../dayDashboard.cards.rules';
	import type { DayDashboardState } from '../dayDashboard.state.svelte';

	interface Props {
		tasks: readonly DashboardFamilyTaskRow[];
		members: readonly DashboardRosterRow[];
		meId: string;
		familyId: string;
		weekStreak: number;
		/** The viewer's saved category names for the quick-add. */
		categories: readonly string[];
		state: DayDashboardState;
		now: Date;
	}

	let { tasks, members, meId, familyId, weekStreak, categories, state, now }: Props = $props();

	const people = $derived(
		members.map((member) => ({
			id: member.userId,
			firstName: member.firstName,
			lastName: member.lastName
		}))
	);

	function memberName(ownerId: string): string {
		if (ownerId === meId) return 'You';
		const member = members.find((entry) => entry.userId === ownerId);
		if (member) return `${member.firstName} ${member.lastName}`.trim();
		return ownerId.slice(0, 8);
	}

	const columns = $derived(
		groupFamilyBoard(tasks, {
			rosterIds: members.map((member) => member.userId),
			viewerId: meId,
			nameFor: memberName,
			now
		})
	);
	const openTotal = $derived(tasks.length);

	function initial(ownerId: string): string {
		const name = memberName(ownerId);
		return name === 'You' ? 'Y' : (name[0]?.toUpperCase() ?? '?');
	}

	function dueLabel(due: string | null): string {
		if (!due) return '';
		const at = new Date(due);
		return Number.isNaN(at.getTime())
			? ''
			: at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}
</script>

<div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
	<h2 class="mb-2.5 text-sm font-semibold text-slate-900 sm:mb-3">Family Task Board</h2>

	<div
		class="mb-2.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b border-slate-100 pb-2.5 sm:mb-3 sm:pb-3"
	>
		<span class="text-xs text-slate-500">
			{openTotal} open · {weekStreak > 0
				? `${weekStreak}-week streak`
				: "Start a streak — check off today's tasks 🔥"}
		</span>
		<a
			href="/family/tasks"
			class="shrink-0 text-xs font-semibold text-primary-600 hover:text-primary-700 hover:underline"
		>
			Board →
		</a>
	</div>

	<form
		onsubmit={(event) => {
			event.preventDefault();
			void state.addFamilyTask();
		}}
		class="mb-3 flex flex-col gap-2 sm:flex-row sm:gap-2"
	>
		<div class="flex min-w-0 flex-wrap items-center gap-2">
			<div class="min-w-0 flex-1">
				<MentionInput
					value={state.quickTitle}
					people={people}
					placeholder="Add a family task… try &quot;saturday for Dad&quot;"
					testid="board-quick-add"
					onchange={(next) => (state.quickTitle = next)}
					onsubmit={() => void state.addFamilyTask()}
				/>
			</div>
			<button
				type="submit"
				disabled={!state.quickTitle.trim() || state.quickBusy}
				class="shrink-0 rounded-lg bg-primary-600 px-3 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50 sm:px-3.5 sm:py-2.5"
			>
				Add
			</button>
			<div class="min-w-0 basis-full">
				<BoardCategoryField
					id="board-quick-add-category"
					value={state.quickCategory}
					{categories}
					compact
					onchange={(next) => (state.quickCategory = next)}
				/>
			</div>
		</div>
		{#if state.quickError}
			<p class="text-xs text-red-600" role="alert">{state.quickError}</p>
		{/if}
	</form>

	{#if openTotal === 0}
		<p class="mb-2 text-xs text-slate-400">No open family tasks — enjoy the calm 👪.</p>
	{/if}
	<div class="space-y-2.5">
		{#each columns as column (column.ownerId)}
			<section>
				<h3
					class="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400"
				>
					<span
						class="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold {idColor(
							column.ownerId
						)}"
					>
						{initial(column.ownerId)}
					</span>
					{column.name}
					<span class="font-normal normal-case text-slate-300">· {column.tasks.length}</span>
				</h3>
				{#if column.tasks.length === 0}
					<p class="truncate pl-7 text-xs text-slate-400">nothing assigned</p>
				{:else}
					<div class="space-y-1.5">
						{#each column.tasks as task (task.id)}
							<div
								class="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/50 px-2.5 py-2 sm:gap-3 sm:rounded-xl sm:px-3 sm:py-2.5"
							>
								<button
									type="button"
									onclick={() => void state.toggleTask(task)}
									disabled={state.busyTaskId === task.id}
									class="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-slate-300 transition-colors enabled:hover:border-primary-500 disabled:opacity-40"
									title="Mark done"
									aria-label="Mark done: {task.title}"
									><span class="absolute -inset-2" aria-hidden="true"></span></button
								>
								<span
									class="h-2 w-2 shrink-0 rounded-full {taskPriorityDot(task.priority)}"
									title="{task.priority} priority"
								></span>
								<p class="min-w-0 flex-1 truncate text-sm text-slate-800">{task.title}</p>
								{#if task.category?.trim()}
									<span
										data-testid="category-chip"
										title="Category: {task.category.trim()}"
										class="inline-flex max-w-[10rem] shrink-0 items-center truncate rounded-full bg-teal-100 px-1.5 py-0.5 text-[10px] font-medium text-teal-800"
										>{task.category.trim()}</span
									>
								{/if}
								{#if task.dueDate}
									<span class="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium {dashboardDueTone(task.dueDate, now)}">
										{dueLabel(task.dueDate)}
									</span>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</section>
		{/each}
	</div>
</div>
