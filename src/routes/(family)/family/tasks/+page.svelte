<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import {
		showRecurringCompleteFeedback,
		showRecurringSkipFeedback
	} from '$lib/client/taskFeedback';
	import { pushToast } from '$lib/client/toasts';

	export let data: PageData;

	type FamilyTask = {
		id: string;
		title: string;
		notes: string | null;
		dueDate: string | null;
		completedAt: string | null;
		recurrenceFrequency?: string | null;
		recurrenceInterval?: number | null;
		completionCount?: number | null;
		assignedTo?: string | null;
		assignmentStatus?: string | null;
		assigneeFirstName?: string | null;
		assigneeLastName?: string | null;
		userId: string;
		creatorFirstName?: string | null;
		tags?: string[];
	};

	let busyId: string | null = null;
	let tagFilter = '';
	/** Inline delete confirmation (matches the family-member remove pattern). */
	let confirmDeleteId: string | null = null;
	/** Issue 019: Family tasks vs the family's Public tasks tab. */
	let tab: 'family' | 'public' = 'family';

	$: publicTasks = data.publicTasks ?? [];

	function nameOf(
		first: string | null | undefined,
		last: string | null | undefined,
		fallback: string
	): string {
		const n = [first, last].filter(Boolean).join(' ').trim();
		return n || fallback;
	}

	/** True when the task has a tag whose name starts with the active filter (case-insensitive). */
	function matchesTagFilter(task: FamilyTask): boolean {
		const q = tagFilter.trim().toLowerCase();
		if (!q) return true;
		return (task.tags ?? []).some((tag) => tag.toLowerCase().startsWith(q));
	}

	$: openTasks = data.tasks.filter((t) => !t.completedAt && matchesTagFilter(t));
	$: completedTasks = data.tasks.filter((t) => t.completedAt && matchesTagFilter(t));
	$: pendingForMe = openTasks.filter(
		(t) => t.assignedTo === data.userId && t.assignmentStatus === 'pending'
	);

	function isOverdue(task: FamilyTask): boolean {
		if (!task.dueDate || task.completedAt) return false;
		return new Date(task.dueDate).getTime() < Date.now();
	}

	function formatDue(due: string | null): string {
		if (!due) return '';
		const dt = new Date(due);
		return isNaN(dt.getTime())
			? ''
			: dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	async function toggle(task: FamilyTask) {
		if (busyId) return;
		const previousDueDate = task.dueDate;
		busyId = task.id;
		try {
			const res = await fetch(`/api/tasks/${task.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ toggleComplete: true })
			});
			if (res.ok) {
				const j = await res.json().catch(() => ({}));
				await invalidateAll();
				showRecurringCompleteFeedback(j.task, previousDueDate);
			} else {
				const j = await res.json().catch(() => ({}));
				pushToast({ message: j.error || `Couldn't update "${task.title}" — try again.` });
			}
		} catch {
			pushToast({ message: 'Network problem — try again.' });
		} finally {
			busyId = null;
		}
	}

	async function advance(task: FamilyTask) {
		if (busyId) return;
		busyId = task.id;
		try {
			const res = await fetch(`/api/tasks/${task.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ advanceToNext: true })
			});
			if (res.ok) {
				const j = await res.json().catch(() => ({}));
				await invalidateAll();
				showRecurringSkipFeedback(j.task);
			} else {
				const j = await res.json().catch(() => ({}));
				pushToast({ message: j.error || `Couldn't skip "${task.title}" — try again.` });
			}
		} catch {
			pushToast({ message: 'Network problem — try again.' });
		} finally {
			busyId = null;
		}
	}

	async function respond(task: FamilyTask, accept: boolean) {
		if (busyId) return;
		busyId = task.id;
		try {
			const res = await fetch(`/api/tasks/${task.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ assignmentStatus: accept ? 'accepted' : 'declined' })
			});
			if (res.ok) {
				pushToast({
					message: accept
						? `Accepted "${task.title}" — it's on your list.`
						: `Declined "${task.title}".`
				});
				await invalidateAll();
			} else {
				const j = await res.json().catch(() => ({}));
				pushToast({ message: j.error || "Couldn't save your response — try again." });
			}
		} catch {
			pushToast({ message: "Couldn't save your response — check your connection." });
		} finally {
			busyId = null;
		}
	}

	async function remove(task: FamilyTask) {
		if (busyId || task.userId !== data.userId) return;
		busyId = task.id;
		try {
			const res = await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' });
			if (res.ok) {
				pushToast({ message: `Deleted "${task.title}".` });
				await invalidateAll();
			} else {
				const j = await res.json().catch(() => ({}));
				pushToast({ message: j.error || `Couldn't delete "${task.title}" — try again.` });
			}
		} catch {
			pushToast({ message: `Couldn't delete "${task.title}" — check your connection.` });
		} finally {
			busyId = null;
			confirmDeleteId = null;
		}
	}
</script>

<div class="mx-auto max-w-2xl p-6">
	<div class="mb-6">
		<a href="/family" class="text-sm text-slate-500 hover:text-slate-700">← Family</a>
		<div class="mt-1 flex items-center justify-between">
			<h1 class="text-2xl font-bold text-slate-900">Family Tasks</h1>
			<a
				href="/calendar/tasks"
				class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
			>
				My tasks
			</a>
		</div>
		{#if pendingForMe.length > 0}
			<p class="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
				📋 {pendingForMe.length} task{pendingForMe.length === 1 ? '' : 's'} waiting for your response
				below.
			</p>
		{/if}
	</div>

	<!-- Issue 019: Family tasks / Public tasks tabs -->
	<div class="mb-4 flex gap-1.5" role="tablist" aria-label="Task lists">
		<button
			type="button"
			role="tab"
			aria-selected={tab === 'family'}
			onclick={() => (tab = 'family')}
			class="min-h-[44px] flex-1 rounded-full border px-3.5 text-sm font-medium transition-colors {tab ===
			'family'
				? 'border-slate-900 bg-slate-900 text-white'
				: 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'}"
		>
			Family tasks
		</button>
		<button
			type="button"
			role="tab"
			aria-selected={tab === 'public'}
			onclick={() => (tab = 'public')}
			class="min-h-[44px] flex-1 rounded-full border px-3.5 text-sm font-medium transition-colors {tab ===
			'public'
				? 'border-slate-900 bg-slate-900 text-white'
				: 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'}"
		>
			Public tasks ({publicTasks.length})
		</button>
	</div>

	{#if tab === 'family'}
		<!-- Tag filter -->
		<div class="mb-4">
			<div class="relative">
				<svg
					class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z"
					/>
				</svg>
				<input
					type="text"
					bind:value={tagFilter}
					placeholder="Filter by #tag..."
					aria-label="Filter tasks by tag"
					class="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-9 text-sm text-slate-700 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none"
				/>
				{#if tagFilter.trim()}
					<button
						type="button"
						onclick={() => (tagFilter = '')}
						aria-label="Clear tag filter"
						class="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
					>
						<svg
							class="h-3.5 w-3.5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				{/if}
			</div>
			{#if tagFilter.trim()}
				<p class="mt-1.5 text-xs text-sky-600">
					Filtering by <span class="font-medium">#{tagFilter.trim().toLowerCase()}</span>
				</p>
			{/if}
		</div>

		{#if openTasks.length === 0 && completedTasks.length === 0}
			{#if tagFilter.trim()}
				<div class="flex flex-col items-center justify-center py-16 text-center">
					<p class="text-lg font-medium text-slate-700">
						No tasks match #<span class="font-semibold">{tagFilter.trim().toLowerCase()}</span>
					</p>
					<p class="text-sm text-slate-500">Clear the filter to see all tasks</p>
				</div>
			{:else}
				<div class="flex flex-col items-center justify-center py-16 text-center">
					<p class="text-lg font-medium text-slate-700">No family tasks yet</p>
					<p class="text-sm text-slate-500">
						Create one from <a href="/calendar/tasks" class="font-medium text-primary-600 underline"
							>My Tasks</a
						>
						and assign it to a family member.
					</p>
				</div>
			{/if}
		{/if}

		{#if openTasks.length === 0 && completedTasks.length > 0 && !tagFilter.trim()}
			<div class="rounded-xl border border-dashed border-slate-200 py-10 text-center">
				<p class="text-sm font-medium text-emerald-600">All caught up 🎉</p>
				<p class="text-sm text-slate-500">Nothing open right now</p>
			</div>
		{/if}

		<div class="space-y-1.5">
			{#each openTasks as task (task.id)}
				<div
					class="group flex flex-wrap items-center gap-3 overflow-hidden rounded-xl border border-slate-200 bg-white p-3 transition-all hover:border-slate-300 active:bg-slate-100"
				>
					<button
						type="button"
						onclick={() => toggle(task)}
						disabled={busyId === task.id}
						class="relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-slate-300 transition-colors hover:border-primary-500 active:border-primary-500"
						aria-label="Complete task"
					>
						<span class="absolute -inset-2" aria-hidden="true"></span>
					</button>

					<div class="min-w-0 flex-1">
						<p class="truncate text-sm font-medium text-slate-900">{task.title}</p>
						<div
							class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500"
						>
							{#if task.dueDate}
								<span class={isOverdue(task) ? 'font-semibold text-red-600' : ''}
									>{formatDue(task.dueDate)}</span
								>
							{/if}
							{#if task.recurrenceFrequency}
								<span class="text-purple-500">🔁 recurring</span>
								{#if task.completionCount}
									<span
										class="inline-flex items-center gap-0.5 rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-600"
									>
										🔥 {task.completionCount}×
									</span>
								{/if}
							{/if}
							<span>by {nameOf(task.creatorFirstName, null, 'family')}</span>
						</div>
						{#if task.tags?.length}
							<div class="mt-1 flex flex-wrap items-center gap-1">
								{#each task.tags as tag (tag)}
									<span
										class="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700"
										>#{tag}</span
									>
								{/each}
							</div>
						{/if}
					</div>

					{#if task.assignedTo}
						{@const mine = task.assignedTo === data.userId}
						{@const pending = task.assignmentStatus === 'pending'}
						{#if mine && pending}
							<span class="flex shrink-0 items-center gap-1">
								<button
									type="button"
									onclick={() => respond(task, true)}
									disabled={busyId === task.id}
									class="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-200 active:bg-emerald-200"
								>
									✓ Accept
								</button>
								<button
									type="button"
									onclick={() => respond(task, false)}
									disabled={busyId === task.id}
									class="rounded-full bg-red-100 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-200 active:bg-red-200"
								>
									✕
								</button>
							</span>
						{:else}
							<span
								class="flex shrink-0 items-center gap-1 rounded-full bg-slate-100 py-0.5 pl-0.5 pr-2 text-xs font-medium text-slate-600"
							>
								<span
									class="flex h-4 w-4 items-center justify-center rounded-full bg-primary-600 text-[9px] font-bold text-white"
								>
									{(task.assigneeFirstName?.[0] ?? '?').toUpperCase()}
								</span>
								{nameOf(task.assigneeFirstName, task.assigneeLastName, task.assignedTo).split(
									' '
								)[0]}
								{#if pending}
									<span
										class="rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-700"
										>pending</span
									>
								{/if}
							</span>
						{/if}
					{/if}

					{#if task.userId === data.userId}
						{#if task.recurrenceFrequency && !task.completedAt}
							<button
								type="button"
								onclick={() => advance(task)}
								disabled={busyId === task.id}
								class="pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 relative shrink-0 rounded-full p-2 text-slate-300 transition-all hover:bg-purple-100 hover:text-purple-500"
								title="Skip this occurrence (rolls to next)"
								aria-label="Skip to next occurrence"
							>
								<svg
									class="h-4 w-4"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									stroke-width="2"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M13 5l7 7-7 7M5 5l7 7-7 7"
									/>
								</svg>
							</button>
						{/if}
						{#if confirmDeleteId === task.id}
							<div class="flex shrink-0 items-center gap-1.5">
								<span class="text-xs font-medium text-red-600">Delete "{task.title}"?</span>
								<button
									type="button"
									onclick={() => remove(task)}
									disabled={busyId === task.id}
									class="rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
								>
									{busyId === task.id ? 'Deleting…' : 'Yes'}
								</button>
								<button
									type="button"
									onclick={() => (confirmDeleteId = null)}
									disabled={busyId === task.id}
									class="rounded-full bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-300"
								>
									No
								</button>
							</div>
						{:else}
							<button
								type="button"
								onclick={() => (confirmDeleteId = task.id)}
								disabled={busyId === task.id}
								class="pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 relative shrink-0 rounded-full p-2 text-slate-300 transition-all hover:bg-red-50 hover:text-red-500"
								aria-label="Delete task"
							>
								<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
									/>
								</svg>
							</button>
						{/if}
					{/if}
				</div>
			{/each}
		</div>

		{#if completedTasks.length > 0}
			<h2 class="mb-2 mt-8 text-xs font-semibold uppercase tracking-wide text-slate-400">
				Completed ({completedTasks.length})
			</h2>
			<div class="space-y-1.5">
				{#each completedTasks as task (task.id)}
					<div
						class="flex flex-wrap items-center gap-3 overflow-hidden rounded-xl bg-slate-50 p-3 active:bg-slate-100"
					>
						<svg
							class="h-5 w-5 shrink-0 text-emerald-500"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
						</svg>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm text-slate-400 line-through">{task.title}</p>
							{#if task.tags?.length}
								<div class="mt-1 flex flex-wrap items-center gap-1">
									{#each task.tags as tag (tag)}
										<span
											class="rounded-full bg-sky-100/60 px-1.5 py-0.5 text-[10px] font-medium text-sky-600"
											>#{tag}</span
										>
									{/each}
								</div>
							{/if}
						</div>
						{#if task.assignedTo}
							<span class="shrink-0 text-xs text-slate-400">
								{nameOf(task.assigneeFirstName, task.assigneeLastName, task.assignedTo).split(
									' '
								)[0]}
							</span>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	{:else}
		<!-- Public tasks tab (issue 019): members' public personal tasks, read-only -->
		{#if publicTasks.length === 0}
			<div class="flex flex-col items-center justify-center py-16 text-center">
				<p class="text-lg font-medium text-slate-700">No public tasks yet</p>
				<p class="text-sm text-slate-500">Tasks your family marks public (🌐) show up here.</p>
			</div>
		{:else}
			<div class="space-y-1.5">
				{#each publicTasks as task (task.id)}
					<div class="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium text-slate-900">{task.title}</p>
							<div
								class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500"
							>
								{#if task.dueDate}
									<span class={isOverdue(task) ? 'font-semibold text-red-600' : ''}
										>{formatDue(task.dueDate)}</span
									>
								{/if}
								<span>by {nameOf(task.creatorFirstName, null, 'a family member')}</span>
							</div>
							{#if task.tags?.length}
								<div class="mt-1 flex flex-wrap items-center gap-1">
									{#each task.tags as tag (tag)}
										<span
											class="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700"
											>#{tag}</span
										>
									{/each}
								</div>
							{/if}
						</div>
						<span
							class="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500"
							title="Public task — read-only for other members"
						>
							🌐 Public
						</span>
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>
