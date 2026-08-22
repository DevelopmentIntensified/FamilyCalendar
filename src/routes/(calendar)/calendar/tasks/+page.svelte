<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import {
		CATEGORY_META,
		SMART_EVENT_TEMPLATES,
		type SmartEventCategory,
		type SmartEventTemplate
	} from '$lib/data/smartEventTemplates';

	export let data: PageData;

	type TaskItem = {
		id: string;
		title: string;
		notes: string | null;
		dueDate: string | null;
		completedAt: string | null;
		recurrenceFrequency?: string | null;
		recurrenceInterval?: number | null;
		eventId: string | null;
		eventTitle?: string | null;
		eventStart?: string | Date | null;
	};

	let newTitle = '';
	let newDueDate = '';
	let adding = false;
	let busyId: string | null = null;
	let busyTemplateId: string | null = null;

	// Edit dialog
	const FREQ_OPTIONS = [
		{ value: '', label: "Doesn't repeat" },
		{ value: 'daily', label: 'Daily' },
		{ value: 'weekly', label: 'Weekly' },
		{ value: 'monthly', label: 'Monthly' },
		{ value: 'yearly', label: 'Yearly' }
	];
	const FREQ_NOUN: Record<string, string> = {
		daily: 'day',
		weekly: 'week',
		monthly: 'month',
		yearly: 'year'
	};

	let editing: TaskItem | null = null;
	let editTitle = '';
	let editNotes = '';
	let editDue = '';
	let editFreq = '';
	let editInterval = 1;
	let editSaving = false;

	function openEdit(task: TaskItem) {
		if (busyId || busyTemplateId) return;
		editing = task;
		editTitle = task.title;
		editNotes = task.notes ?? '';
		editDue = toInputDate(task.dueDate);
		editFreq = task.recurrenceFrequency ?? '';
		editInterval = task.recurrenceInterval ?? 1;
	}

	function closeEdit() {
		editing = null;
	}

	function pad(n: number): string {
		return String(n).padStart(2, '0');
	}

	function toInputDate(iso: string | null): string {
		if (!iso) return '';
		const d = new Date(iso);
		return isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
	}

	function inputToIso(value: string): string | null {
		if (!value) return null;
		const [y, m, d] = value.split('-').map(Number);
		return new Date(y, m - 1, d, 23, 59, 0, 0).toISOString();
	}

	async function saveEdit() {
		if (!editing || !editTitle.trim() || editSaving) return;
		editSaving = true;
		try {
			const res = await fetch(`/api/tasks/${editing.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: editTitle.trim(),
					notes: editNotes.trim() || null,
					dueDate: inputToIso(editDue),
					recurrenceFrequency: editFreq || null,
					recurrenceInterval: editFreq ? Math.max(1, Math.floor(editInterval)) : null
				})
			});
			if (res.ok) {
				closeEdit();
				await invalidateAll();
			}
		} finally {
			editSaving = false;
		}
	}

	$: openTasks = (data.tasks as TaskItem[]).filter((t) => !t.completedAt);
	$: completedTasks = (data.tasks as TaskItem[]).filter((t) => t.completedAt);
	// Baseline framing (time-tracker research): show completions vs recent
	// activity, not streaks or leaderboards.
	$: completedThisWeek = completedTasks.filter(
		(t) => t.completedAt && Date.now() - new Date(t.completedAt).getTime() < 7 * 24 * 60 * 60 * 1000
	).length;

	const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

	/**
	 * Quick-add markup: 'buy milk tomorrow', 'clean gutters saturday'.
	 * Extracts a due date so capture stays one-field fast.
	 */
	function parseQuickAdd(raw: string): { title: string; dueDate: string | null } {
		const match = raw.match(/\b(today|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)\b/i);
		if (!match) return { title: raw.trim(), dueDate: newDueDate || null };

		const token = match[1].toLowerCase();
	 const target = new Date();
		target.setHours(23, 59, 0, 0);

		if (token === 'tomorrow') {
			target.setDate(target.getDate() + 1);
		} else if (token !== 'today') {
			const full = WEEKDAYS.findIndex((d) => d.startsWith(token.slice(0, 3)));
			if (full === -1) return { title: raw.trim(), dueDate: newDueDate || null };
			let delta = (full - target.getDay() + 7) % 7;
			if (delta === 0) delta = 7; // "friday" on a friday means next friday
			target.setDate(target.getDate() + delta);
		}

		const title = raw.replace(match[0], '').replace(/\s{2,}/g, ' ').trim() || raw.trim();
		return { title, dueDate: target.toISOString() };
	}

	function formatDue(due: string | null): string {
		if (!due) return '';
		const dt = new Date(due);
		if (isNaN(dt.getTime())) return '';
		return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	function isOverdue(task: TaskItem): boolean {
		if (!task.dueDate || task.completedAt) return false;
		return new Date(task.dueDate).getTime() < Date.now();
	}

	async function addTask() {
		if (!newTitle.trim()) return;
		adding = true;
		try {
			const parsed = parseQuickAdd(newTitle);
			const res = await fetch('/api/tasks', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: parsed.title, dueDate: parsed.dueDate })
			});
			if (res.ok) {
				newTitle = '';
				newDueDate = '';
				await invalidateAll();
			}
		} finally {
			adding = false;
		}
	}

	// Templates were built for recurring events; standalone tasks keep the
	// cadence as a note so the guidance survives the move.
	function cadenceNote(t: SmartEventTemplate): string {
		if (t.description) return t.description;
		const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[t.recurrenceFrequency];
		const units = { daily: 'days', weekly: 'weeks', monthly: 'months', yearly: 'years' }[t.recurrenceFrequency];
		return t.recurrenceInterval > 1 ? `Every ${t.recurrenceInterval} ${units}` : `Every ${unit}`;
	}

	async function addSmartTask(t: SmartEventTemplate) {
		if (busyTemplateId) return;
		busyTemplateId = t.id;
		try {
			const res = await fetch('/api/tasks', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: t.name, notes: cadenceNote(t) })
			});
			if (res.ok) await invalidateAll();
		} finally {
			busyTemplateId = null;
		}
	}

	async function toggleTask(id: string) {
		busyId = id;
		try {
			await fetch(`/api/tasks/${id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ toggleComplete: true })
			});
			await invalidateAll();
		} finally {
			busyId = null;
		}
	}

	async function deleteTask(id: string) {
		busyId = id;
		try {
			await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
			await invalidateAll();
		} finally {
			busyId = null;
		}
	}
</script>

<div class="mx-auto max-w-2xl p-6">
	<h1 class="mb-6 text-2xl font-bold text-slate-900">Tasks</h1>

	<!-- Add task -->
	<form
		onsubmit={(e) => {
			e.preventDefault();
			addTask();
		}}
		class="mb-6 flex flex-col gap-2 sm:flex-row"
	>
		<input
			type="text"
			bind:value={newTitle}
			placeholder="Add a task..."
			class="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
		/>
		<input
			type="date"
			bind:value={newDueDate}
			aria-label="Due date"
			class="rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-600"
		/>
		<button
			type="submit"
			disabled={adding || !newTitle.trim()}
			class="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
		>
			Add
		</button>
	</form>

	<!-- Smart task templates -->
	<details class="group mb-6">
		<summary class="flex w-fit cursor-pointer select-none items-center gap-1 rounded-full px-2 py-0.5 text-xs text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600">
			<span>✨ Smart tasks</span>
			<svg class="h-3 w-3 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
			</svg>
		</summary>
		<div class="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
			{#each Object.keys(CATEGORY_META) as cat}
				{@const templates = SMART_EVENT_TEMPLATES.filter((t) => t.category === (cat as SmartEventCategory))}
				<details class="mb-1 last:mb-0" open={Object.keys(CATEGORY_META).indexOf(cat) === 0}>
					<summary class="cursor-pointer select-none rounded-lg px-2 py-1.5 text-sm font-medium text-slate-700 hover:bg-white">
						{CATEGORY_META[cat as SmartEventCategory].icon}
						{CATEGORY_META[cat as SmartEventCategory].label}
						<span class="ml-1 text-xs font-normal text-slate-400">({templates.length})</span>
					</summary>
					<div class="mt-1 flex flex-wrap gap-1.5 pl-2">
						{#each templates as template (template.id)}
							<button
								type="button"
								onclick={() => addSmartTask(template)}
								disabled={busyTemplateId === template.id}
								title={cadenceNote(template)}
								class="rounded-full border px-2.5 py-1 text-xs font-medium transition-colors hover:opacity-80 disabled:opacity-50 {CATEGORY_META[template.category].color}"
							>
								{template.name}
							</button>
						{/each}
					</div>
				</details>
			{/each}
		</div>
	</details>

	{#if openTasks.length === 0 && completedTasks.length === 0}
		<div class="flex flex-col items-center justify-center py-16 text-center">
			<svg class="mb-4 h-14 w-14 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
			</svg>
			<p class="text-lg font-medium text-slate-700">No tasks yet</p>
			<p class="text-sm text-slate-500">Add your first task above</p>
		</div>
	{/if}

	<!-- Open tasks -->
	<div class="space-y-1.5">
		{#each openTasks as task (task.id)}
			<div
				class="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 transition-all hover:border-slate-300"
			>
				<button
					type="button"
					onclick={() => toggleTask(task.id)}
					disabled={busyId === task.id}
					class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-slate-300 transition-colors hover:border-primary-500"
					aria-label="Complete task"
				></button>
							<div class="min-w-0 flex-1">
								<button
									type="button"
									onclick={() => openEdit(task)}
									class="block w-full truncate text-left text-sm font-medium text-slate-900 hover:text-primary-600"
									title="Edit task"
								>
									{task.title}
								</button>
								{#if task.recurrenceFrequency}
									<p class="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-purple-500">
										<svg class="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
											<path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h5M20 20v-5h-5M4 9a8 8 0 0114-3m2 9a8 8 0 01-14 3" />
										</svg>
										{task.recurrenceInterval && task.recurrenceInterval > 1
											? `every ${task.recurrenceInterval} ${FREQ_NOUN[task.recurrenceFrequency] ?? task.recurrenceFrequency}s`
											: `every ${FREQ_NOUN[task.recurrenceFrequency] ?? task.recurrenceFrequency}`}
									</p>
								{:else if task.eventTitle}
									<p class="mt-0.5 flex items-center gap-1 truncate text-xs font-medium text-primary-500">
										<svg class="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
										</svg>
										{task.eventTitle}
									</p>
								{:else if task.notes}
									<p class="truncate text-xs text-slate-500">{task.notes}</p>
								{/if}
							</div>
				{#if task.dueDate}
					<span class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium {isOverdue(task) ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}">
						{formatDue(task.dueDate)}
					</span>
				{/if}
				<button
					type="button"
					onclick={() => deleteTask(task.id)}
					disabled={busyId === task.id}
					class="shrink-0 rounded-full p-1.5 text-slate-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
					aria-label="Delete task"
				>
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
					</svg>
				</button>
			</div>
		{/each}
	</div>

	<!-- Completed -->
	{#if completedTasks.length > 0}
		<h2 class="mb-2 mt-8 text-xs font-semibold uppercase tracking-wide text-slate-400">
			Completed ({completedTasks.length})
			{#if completedThisWeek > 0}
				<span class="ml-1 font-normal normal-case text-emerald-600">· {completedThisWeek} this week</span>
			{/if}
		</h2>
		<div class="space-y-1.5">
			{#each completedTasks as task (task.id)}
				<div class="group flex items-center gap-3 rounded-xl bg-slate-50 p-3">
					<button
						type="button"
						onclick={() => toggleTask(task.id)}
						disabled={busyId === task.id}
						class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-500 text-white"
						aria-label="Mark incomplete"
					>
						<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
							<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
						</svg>
					</button>
								<p class="min-w-0 flex-1 truncate text-sm text-slate-400 line-through">
										{task.title}
										{#if task.eventTitle}<span class="ml-1 text-xs font-normal text-slate-400 no-underline">({task.eventTitle})</span>{/if}
									</p>
					<button
						type="button"
						onclick={() => deleteTask(task.id)}
						disabled={busyId === task.id}
						class="shrink-0 rounded-full p-1.5 text-slate-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
						aria-label="Delete task"
					>
						<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
						</svg>
					</button>
				</div>
			{/each}
		</div>
	{/if}
</div>

<!-- Edit task dialog -->
{#if editing}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
		onclick={closeEdit}
		onkeydown={(e) => e.key === 'Escape' && closeEdit()}
		role="presentation"
	>
		<div
			class="w-full max-w-md rounded-xl bg-white shadow-2xl"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			aria-label="Edit task"
		>
			<div class="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
				<h2 class="text-base font-semibold text-slate-900">Edit Task</h2>
				<button
					type="button"
					onclick={closeEdit}
					class="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
					aria-label="Close"
				>
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<form
				class="space-y-3 p-5"
				onsubmit={(e) => {
					e.preventDefault();
					saveEdit();
				}}
			>
				<div>
					<label for="edit-title" class="mb-1 block text-sm font-medium text-slate-700">Title *</label>
					<input
						id="edit-title"
						type="text"
						bind:value={editTitle}
						required
						class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
					/>
				</div>

				<div>
					<label for="edit-notes" class="mb-1 block text-sm font-medium text-slate-700">Notes</label>
					<textarea
						id="edit-notes"
						bind:value={editNotes}
						rows="2"
						class="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
					></textarea>
				</div>

				<div class="grid grid-cols-2 gap-3">
					<div>
						<label for="edit-due" class="mb-1 block text-sm font-medium text-slate-700">Due date</label>
						<input
							id="edit-due"
							type="date"
							bind:value={editDue}
							class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
						/>
					</div>
					<div>
						<label for="edit-freq" class="mb-1 block text-sm font-medium text-slate-700">Repeats</label>
						<select
							id="edit-freq"
							bind:value={editFreq}
							class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
						>
							{#each FREQ_OPTIONS as opt (opt.value)}
								<option value={opt.value}>{opt.label}</option>
							{/each}
						</select>
					</div>
				</div>

				{#if editFreq}
					<div class="flex items-center gap-2 rounded-lg bg-purple-50 px-3 py-2">
						<span class="text-sm text-purple-800">Every</span>
						<input
							type="number"
							min="1"
							max="365"
							bind:value={editInterval}
							aria-label="Repeat interval"
							class="w-16 rounded-lg border border-purple-200 px-2 py-1 text-sm focus:border-purple-400 focus:outline-none"
						/>
						<span class="text-sm text-purple-800">{FREQ_NOUN[editFreq]}{editInterval > 1 ? 's' : ''}</span>
					</div>
				{/if}

				{#if editFreq}
					<p class="text-xs text-slate-400">Completing it rolls the due date forward automatically.</p>
				{/if}

				<div class="flex justify-end gap-2 pt-1">
					<button
						type="button"
						onclick={closeEdit}
						class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
					>
						Cancel
					</button>
					<button
						type="submit"
						disabled={editSaving || !editTitle.trim()}
						class="rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
					>
						{editSaving ? 'Saving…' : 'Save'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
