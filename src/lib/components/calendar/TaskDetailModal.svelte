<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { trapFocusAction } from '$lib/utils/focusTrap';
	import { showRecurringCompleteFeedback, showRecurringSkipFeedback } from '$lib/client/taskFeedback';

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
	}

	export let task: CalendarTask;
	export let onClose: () => void = () => {};

	const FREQ_NOUN: Record<string, string> = {
		daily: 'day',
		weekly: 'week',
		monthly: 'month',
		yearly: 'year'
	};

	let busy = false;
	let actionError = '';

	function formatDue(due: Date | string | null | undefined): string {
		if (!due) return '';
		const d = due instanceof Date ? due : new Date(due);
		if (isNaN(d.getTime())) return '';
		return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
	}

	function isOverdue(): boolean {
		if (!task.dueDate || task.completedAt) return false;
		const d = task.dueDate instanceof Date ? task.dueDate : new Date(task.dueDate);
		return !isNaN(d.getTime()) && d.getTime() < Date.now();
	}

	function freqLabel(): string {
		if (!task.recurrenceFrequency) return '';
		const noun = FREQ_NOUN[task.recurrenceFrequency] ?? task.recurrenceFrequency;
		return task.recurrenceInterval && task.recurrenceInterval > 1
			? `every ${task.recurrenceInterval} ${noun}s`
			: `every ${noun}`;
	}

	const PRIORITY_META: Record<string, { label: string; cls: string }> = {
		high: { label: 'High', cls: 'bg-red-100 text-red-700' },
		normal: { label: 'Normal', cls: 'bg-slate-100 text-slate-600' },
		low: { label: 'Low', cls: 'bg-sky-100 text-sky-700' }
	};

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
		if (!confirm('Delete this task?')) return;
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

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
	onclick={onClose}
	onkeydown={(e) => e.key === 'Escape' && onClose()}
	role="presentation"
>
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
				onclick={onClose}
				class="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
				aria-label="Close"
			>
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		</div>

		<div class="space-y-4 p-5">
			<div>
				<h3 class="text-lg font-semibold text-slate-900">{task.title}</h3>
				{#if task.eventTitle}
					<p class="mt-0.5 text-sm text-primary-600">{task.eventTitle}</p>
				{/if}
			</div>

			{#if task.tags && task.tags.length > 0}
				<div class="flex flex-wrap gap-1.5">
					{#each task.tags as tag (tag)}
						<span class="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700">#{tag}</span>
					{/each}
				</div>
			{/if}

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
						<dd class="rounded-full px-2 py-0.5 font-medium {PRIORITY_META[task.priority]?.cls ?? PRIORITY_META.normal.cls}">
							{PRIORITY_META[task.priority]?.label ?? 'Normal'}
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

			<div class="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
				{#if task.recurrenceFrequency && !task.completedAt}
					<button
						type="button"
						onclick={advance}
						disabled={busy}
						class="rounded-lg border border-purple-200 px-4 py-2 text-sm font-medium text-purple-700 hover:bg-purple-50 disabled:opacity-50"
					>
						Skip occurrence
					</button>
				{/if}
				<button
					type="button"
					onclick={remove}
					disabled={busy}
					class="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
				>
					Delete
				</button>
				<button
					type="button"
					onclick={toggleComplete}
					disabled={busy}
					class="rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
				>
					{busy ? 'Working…' : 'Mark complete'}
				</button>
			</div>
		</div>
	</div>
</div>
