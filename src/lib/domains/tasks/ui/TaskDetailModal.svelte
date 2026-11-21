<!--
	The task detail sheet (legacy `components/calendar/TaskDetailModal.svelte`,
	which lived in the calendar folder only because that page opened it): the
	facts a chip cannot show, and the three lifecycle actions — complete (or
	advance a repeating Task), skip to the next occurrence, delete.

	It composes tasks' own client api, so the calendar screen hands it a row and
	gets `onchanged` back; no `$app/*`, no fetch here. Fields the caller does not
	hold are simply not drawn (a calendar chip carries less than the tasks page).
-->
<script module lang="ts">
	import type { TaskPageRow } from '../tasks.contract';

	/** The fields this sheet draws; every optional one is simply absent if unheld. */
	export type TaskDetailRow = Pick<TaskPageRow, 'id' | 'title'> &
		Partial<
			Pick<
				TaskPageRow,
				| 'dueDate'
				| 'completedAt'
				| 'recurrenceFrequency'
				| 'recurrenceInterval'
				| 'completionCount'
				| 'priority'
				| 'notes'
				| 'tags'
				| 'assignedTo'
				| 'assigneeFirstName'
				| 'assigneeLastName'
				| 'eventTitle'
				| 'familyId'
				| 'visibility'
			>
		>;
</script>

<script lang="ts">
	import Sheet from '$lib/kernel/ui/Sheet.svelte';
	import Pill from '$lib/kernel/ui/Pill.svelte';
	import { systemClock } from '$lib/kernel/time/clock';
	import { createApiClient } from '$lib/kernel/client/apiClient';
	import { createTasksApi } from '../tasks.api';
	import {
		formatTaskDue,
		taskPriorityLabel,
		taskRecurrenceLabel
	} from '../tasks.display.rules';

	interface Props {
		task: TaskDetailRow;
		onclose: () => void;
		/** A write landed; the caller reloads. */
		onchanged?: () => void;
		/** The viewer's instant, so "(overdue)" is judged by the caller's clock. */
		now?: Date;
	}

	let { task, onclose, onchanged, now = systemNow() }: Props = $props();

	/** The caller's instant; a caller that does not care gets the client clock. */
	function systemNow(): Date {
		return systemClock.now();
	}

	const api = createTasksApi(createApiClient());
	let busy = $state(false);
	let actionError = $state('');
	let showDeleteConfirm = $state(false);

	const recurrence = $derived(
		taskRecurrenceLabel({
			...task,
			recurrenceFrequency: task.recurrenceFrequency ?? null,
			recurrenceInterval: task.recurrenceInterval ?? 1,
			completionCount: task.completionCount ?? 0
		} as TaskPageRow)
	);
	const overdue = $derived(
		!!task.dueDate && !task.completedAt && new Date(task.dueDate).getTime() < now.getTime()
	);
	const grouped = $derived(!!task.familyId);
	const assigneeName = $derived(
		[task.assigneeFirstName, task.assigneeLastName].filter(Boolean).join(' ') || task.assignedTo
	);

	async function run(action: () => Promise<{ ok: boolean; error?: string }>, close = true) {
		if (busy) return;
		busy = true;
		actionError = '';
		try {
			const result = await action();
			if (!result.ok) {
				actionError = result.error || "That didn't work. Try again.";
				return;
			}
			onchanged?.();
			if (close) onclose();
		} catch {
			actionError = 'Network problem. Try again.';
		} finally {
			busy = false;
		}
	}

	const toggleComplete = () =>
		run(() => api.update(task.id, { toggleComplete: true }), false);
	const advance = () => run(() => api.update(task.id, { advanceToNext: true }));
	const remove = () => run(() => api.remove(task.id));
</script>

<Sheet open {onclose} title="Task Details" testid="task-detail">
	<div class="space-y-4">
		<div>
			<h3 class="text-lg font-semibold text-slate-900">{task.title}</h3>
			{#if task.eventTitle}
				<p class="mt-0.5 text-sm text-primary-600">{task.eventTitle}</p>
			{/if}
		</div>

		<div class="flex flex-wrap gap-1.5">
			{#if grouped}
				<Pill tone="family">Family</Pill>
			{:else}
				<Pill tone="neutral">{task.visibility === 'private' ? 'Private' : 'Public'}</Pill>
			{/if}
			{#each task.tags ?? [] as tag (tag)}
				<Pill tone="accent">#{tag}</Pill>
			{/each}
		</div>

		<dl class="space-y-2.5 text-sm">
			{#if task.dueDate}
				<div class="flex items-center justify-between gap-3">
					<dt class="text-slate-500">Due</dt>
					<dd
						class="rounded-full px-2 py-0.5 font-medium {overdue
							? 'bg-red-100 text-red-700'
							: 'bg-slate-100 text-slate-600'}"
					>
						{formatTaskDue(task.dueDate, now)}
						{#if overdue}<span class="ml-1">(overdue)</span>{/if}
					</dd>
				</div>
			{/if}
			{#if task.priority}
				<div class="flex items-center justify-between gap-3">
					<dt class="text-slate-500">Priority</dt>
					<dd class="font-medium text-slate-700">{taskPriorityLabel(task.priority)}</dd>
				</div>
			{/if}
			{#if recurrence}
				<div class="flex items-center justify-between gap-3">
					<dt class="text-slate-500">Repeats</dt>
					<dd class="font-medium text-purple-600">{recurrence}</dd>
				</div>
			{/if}
			{#if assigneeName}
				<div class="flex items-center justify-between gap-3">
					<dt class="text-slate-500">Assigned to</dt>
					<dd class="font-medium text-slate-700">{assigneeName}</dd>
				</div>
			{/if}
			{#if task.notes}
				<div class="rounded-lg bg-slate-50 p-3">
					<dt class="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Notes</dt>
					<dd class="whitespace-pre-wrap text-slate-700">{task.notes}</dd>
				</div>
			{/if}
		</dl>

		{#if actionError}
			<div role="alert" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
				{actionError}
			</div>
		{/if}

		{#if showDeleteConfirm}
			<div class="rounded-lg border border-red-200 bg-red-50 p-2.5">
				<div class="flex flex-wrap items-center gap-2">
					<span class="text-xs font-medium text-red-700">Delete this task?</span>
					<button
						type="button"
						onclick={remove}
						disabled={busy}
						class="rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
					>
						{busy ? 'Deleting…' : 'Yes, delete'}
					</button>
					<button
						type="button"
						onclick={() => (showDeleteConfirm = false)}
						disabled={busy}
						class="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
					>
						Cancel
					</button>
				</div>
			</div>
		{:else}
			<div class="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
				<button
					type="button"
					onclick={() => void toggleComplete()}
					disabled={busy}
					class="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-700 disabled:opacity-50"
				>
					{busy ? 'Saving…' : task.completedAt ? 'Mark not done' : 'Mark done'}
				</button>
				{#if task.recurrenceFrequency && !task.completedAt}
					<button
						type="button"
						onclick={() => void advance()}
						disabled={busy}
						class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
					>
						Skip this one
					</button>
				{/if}
				<button
					type="button"
					onclick={() => (showDeleteConfirm = true)}
					disabled={busy}
					class="ml-auto rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
				>
					Delete
				</button>
			</div>
		{/if}
	</div>
</Sheet>
