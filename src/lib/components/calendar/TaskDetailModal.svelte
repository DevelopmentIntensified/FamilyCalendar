<script module lang="ts">
	/** The task shape the calendar views pass through for the detail popup. */
	export interface CalendarTask {
		id: string;
		title: string;
		dueDate?: Date | string | null;
		completedAt?: string | null;
		recurrenceFrequency?: string | null;
		recurrenceInterval?: number | null;
		completionCount?: number | null;
		priority?: string | null;
		notes?: string | null;
		tags?: string[];
		assignedTo?: string | null;
		assigneeFirstName?: string | null;
		assigneeLastName?: string | null;
		eventTitle?: string | null;
		// Issue 021 parity: scoping fields ride along in the task JSON.
		familyId?: string | null;
		visibility?: 'public' | 'private';
	}
</script>

<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { trapFocusAction } from '$lib/utils/focusTrap';
	import TaskDetailBar from './TaskDetailBar.svelte';
	import { formatDueLong as formatDue, freqNoun } from '$lib/utils/taskDisplay';
	import { isOverdue as isDueOverdue, priorityLabel, priorityTone } from '$lib/utils/priorityTone';
	import {
		showRecurringCompleteFeedback,
		showRecurringSkipFeedback
	} from '$lib/client/taskFeedback';

	export let task: CalendarTask;
	export let onClose: () => void = () => {};

	/** Recurrence noun via shared taskDisplay (falls back to raw code). */
	function freqNounOrRaw(frequency: string): string {
		return freqNoun(frequency) ?? frequency;
	}

	let busy = false;
	let actionError = '';
	/** Inline delete confirmation — matches the family-member remove pattern. */
	let showDeleteConfirm = false;

	function close() {
		showDeleteConfirm = false;
		onClose();
	}

	function isOverdue(): boolean {
		if (!task.dueDate || task.completedAt) return false;
		const iso = task.dueDate instanceof Date ? task.dueDate.toISOString() : task.dueDate;
		return isDueOverdue(iso);
	}

	function freqLabel(): string {
		if (!task.recurrenceFrequency) return '';
		const noun = freqNounOrRaw(task.recurrenceFrequency);
		return task.recurrenceInterval && task.recurrenceInterval > 1
			? `every ${task.recurrenceInterval} ${noun}s`
			: `every ${noun}`;
	}

	/** Priority chip via shared palette (low muted per project direction — was sky here). */
	function priorityMeta(priority: string) {
		return { label: priorityLabel(priority), cls: priorityTone(priority) };
	}

	const NORMAL_TONE = priorityTone('normal');

	async function toggleComplete() {
		if (busy) return;
		const previousDueDate = task.dueDate ?? null;
		busy = true;
		actionError = '';
		try {
			const res = await fetch(`/api/tasks/${task.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ toggleComplete: true })
			});
			if (!res.ok) {
				const j = await res.json().catch(() => ({}));
				actionError = j.error || "That didn't work. Try again.";
				return;
			}
			const j = await res.json().catch(() => ({}));
			await invalidateAll();
			showRecurringCompleteFeedback(j.task, previousDueDate);
			onClose();
		} catch {
			actionError = 'Network problem. Try again.';
		} finally {
			busy = false;
		}
	}

	async function advance() {
		if (busy) return;
		busy = true;
		actionError = '';
		try {
			const res = await fetch(`/api/tasks/${task.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ advanceToNext: true })
			});
			if (!res.ok) {
				const j = await res.json().catch(() => ({}));
				actionError = j.error || "That didn't work. Try again.";
				return;
			}
			const j = await res.json().catch(() => ({}));
			await invalidateAll();
			showRecurringSkipFeedback(j.task);
			onClose();
		} catch {
			actionError = 'Network problem. Try again.';
		} finally {
			busy = false;
		}
	}

	async function remove() {
		if (busy) return;
		busy = true;
		actionError = '';
		try {
			const res = await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' });
			if (!res.ok) {
				const j = await res.json().catch(() => ({}));
				actionError = j.error || "That didn't work. Try again.";
				return;
			}
			await invalidateAll();
			onClose();
		} catch {
			actionError = 'Network problem. Try again.';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:window on:keydown={(e) => e.key === 'Escape' && close()} />

<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
	onclick={close}
	onkeydown={(e) => e.key === 'Escape' && close()}
	role="presentation"
>
	<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
	<div
		class="w-full max-w-md rounded-xl bg-white shadow-2xl"
		onclick={(e) => e.stopPropagation()}
		onkeydown={(e) => e.stopPropagation()}
		role="dialog"
		aria-modal="true"
		aria-label="Task details"
		use:trapFocusAction
	>
		<div class="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
			<h2 class="text-base font-semibold text-slate-900">Task Details</h2>
			<button
				type="button"
				onclick={close}
				class="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
				aria-label="Close"
			>
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		</div>

		<div class="max-h-[80dvh] space-y-4 overflow-y-auto p-5">
			<div>
				<h3 class="text-lg font-semibold text-slate-900">{task.title}</h3>
				{#if task.eventTitle}
					<p class="mt-0.5 text-sm text-primary-600">{task.eventTitle}</p>
				{/if}
			</div>

			<div class="flex flex-wrap gap-1.5">
				{#if task.familyId}
					<span
						class="inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700"
						title="Family task"
					>
						Family
					</span>
				{:else}
					<span
						class="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500"
						title={task.visibility === 'private'
							? 'Private — only you and the assignee'
							: 'Public — family can see it (read-only)'}
					>
						{task.visibility === 'private' ? '🔒 Private' : '🌐 Public'}
					</span>
				{/if}
				{#each task.tags ?? [] as tag (tag)}
					<span class="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700"
						>#{tag}</span
					>
				{/each}
			</div>

			<dl class="space-y-2.5 text-sm">
				{#if task.dueDate}
					<div class="flex items-center justify-between gap-3">
						<dt class="text-slate-500">Due</dt>
						<dd
							class="rounded-full px-2 py-0.5 font-medium {isOverdue()
								? 'bg-red-100 text-red-700'
								: 'bg-slate-100 text-slate-600'}"
						>
							{formatDue(task.dueDate)}
							{#if isOverdue()}<span class="ml-1">(overdue)</span>{/if}
						</dd>
					</div>
				{/if}
				{#if task.priority}
					<div class="flex items-center justify-between gap-3">
						<dt class="text-slate-500">Priority</dt>
						<dd
							class="rounded-full px-2 py-0.5 font-medium {priorityMeta(task.priority).cls ??
								NORMAL_TONE}"
						>
							{priorityMeta(task.priority).label ?? 'Normal'}
						</dd>
					</div>
				{/if}
				{#if task.recurrenceFrequency}
					<div class="flex items-center justify-between gap-3">
						<dt class="text-slate-500">Repeats</dt>
						<dd class="flex items-center gap-2">
							<span class="font-medium text-purple-600">🔁 {freqLabel()}</span>
							{#if task.completionCount}
								<span
									class="inline-flex items-center gap-0.5 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-600"
									title="Completed occurrences so far"
								>
									🔥 Done {task.completionCount}× so far
								</span>
							{/if}
						</dd>
					</div>
				{/if}
				{#if task.assignedTo}
					<div class="flex items-center justify-between gap-3">
						<dt class="text-slate-500">Assigned to</dt>
						<dd class="font-medium text-slate-700">
							{task.assigneeFirstName || task.assigneeLastName
								? `${task.assigneeFirstName ?? ''} ${task.assigneeLastName ?? ''}`.trim()
								: task.assignedTo}
						</dd>
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

			<TaskDetailBar
				{busy}
				{showDeleteConfirm}
				canSkip={!!task.recurrenceFrequency && !task.completedAt}
				onAdvance={advance}
				onRemove={remove}
				onBeginDelete={() => (showDeleteConfirm = true)}
				onCancelDelete={() => (showDeleteConfirm = false)}
				onToggleComplete={toggleComplete}
			/>
		</div>
	</div>
</div>
