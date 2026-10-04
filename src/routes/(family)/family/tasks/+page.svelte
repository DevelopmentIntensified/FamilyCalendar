<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import {
		showRecurringCompleteFeedback,
		showRecurringSkipFeedback
	} from '$lib/client/taskFeedback';
	import { pushToast } from '$lib/client/toasts';
	import FamilyTaskRow from '$lib/components/tasks/FamilyTaskRow.svelte';
	import FamilyOpenTaskRow from '$lib/components/tasks/FamilyOpenTaskRow.svelte';
	import FamilyCompletedTaskList from '$lib/components/tasks/FamilyCompletedTaskList.svelte';
	import TaskTagFilter from '$lib/components/tasks/TaskTagFilter.svelte';
	import EditTaskDialog, { type EditDraft } from '$lib/components/tasks/EditTaskDialog.svelte';
	import { avatarColor } from '$lib/utils/avatarColor';
	import { groupTasksByAssignee } from '$lib/utils/familyTaskGroups';
	import { buildEditPayload } from '$lib/utils/taskEditPayload';
	import {
		advanceTask,
		deleteTask,
		matchesTagFilter,
		nameOf,
		respondToTask,
		toggleTask
	} from '$lib/utils/familyTaskActions';

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
	/** Edit dialog target + save (mirrors the personal tasks page; owner-only). */
	let editing: FamilyTask | null = null;
	let editSaving = false;
	/** Inline delete confirmation (matches the family-member remove pattern). */
	let confirmDeleteId: string | null = null;
	/** Issue 019: Family tasks vs the family's Public tasks tab. */
	let tab: 'family' | 'public' = 'family';

	$: publicTasks = data.publicTasks ?? [];

	$: openTasks = data.tasks.filter((t) => !t.completedAt && matchesTagFilter(t, tagFilter));
	$: completedTasks = data.tasks.filter((t) => t.completedAt && matchesTagFilter(t, tagFilter));
	$: pendingForMe = openTasks.filter(
		(t) => t.assignedTo === data.userId && t.assignmentStatus === 'pending'
	);

	function isOverdue(task: FamilyTask): boolean {
		if (!task.dueDate || task.completedAt) return false;
		return new Date(task.dueDate).getTime() < Date.now();
	}

	/* ── The board (issue 101, decision 1; revised by the owner) ─────────────
	   One column per person, the way CONTEXT.md defines the Family Task Board:
	   grouped by assignee. The grouping lives in one module so this page and the
	   dashboard card cannot drift into two shapes. Empty columns do not render
	   (a member with nothing assigned gets no heading about nothing).

	   **The creator fallback is no longer used here.** The owner approved
	   `family-tasks.html`'s "Nobody" card, which shows unassigned Tasks where
	   they actually are instead of filing them under whoever created them, so
	   the board is fed only the Tasks that really have an assignee. The shared
	   module keeps its fallback for the dashboard card, which is a different
	   surface with its own decision. */
	function memberName(userId: string): string {
		if (userId === data.userId) return 'You';
		const m = (data.familyRoster ?? []).find((r) => r.userId === userId);
		if (m) return `${m.firstName} ${m.lastName}`.trim();
		return userId.slice(0, 8);
	}

	function initial(name: string): string {
		return (name[0] ?? '?').toUpperCase();
	}

	/** Tasks nobody has taken — the approved card's own home. */
	$: unassignedTasks = openTasks.filter((t) => !t.assignedTo);
	$: boardGroups = groupTasksByAssignee(
		openTasks.filter((t) => t.assignedTo),
		memberName,
		data.userId
	);

	function formatDue(due: string | null): string {
		if (!due) return '';
		const dt = new Date(due);
		return isNaN(dt.getTime())
			? ''
			: dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	/**
	 * Overdue first inside a column (issue 124). `family-tasks.html` sorts each
	 * person's tasks so the late one is at the top: "the grouping is by person,
	 * the urgency is by date". The board used to print them in insertion order,
	 * so a task that was due yesterday could sit under one due next week.
	 *
	 * The grouping lives in `$lib/utils/familyTaskGroups`, which also serves the
	 * dashboard card — so the sort is applied here, on this surface only.
	 */
	function overdueFirst(tasks: FamilyTask[]): FamilyTask[] {
		return [...tasks].sort((a, b) => Number(isOverdue(b)) - Number(isOverdue(a)));
	}

	async function toggle(task: FamilyTask) {
		if (busyId) return;
		const previousDueDate = task.dueDate;
		busyId = task.id;
		const out = await toggleTask(task);
		if (out.ok) {
			await invalidateAll();
			showRecurringCompleteFeedback(out.task, previousDueDate);
		} else {
			pushToast({ message: out.error });
		}
		busyId = null;
	}

	async function advance(task: FamilyTask) {
		if (busyId) return;
		busyId = task.id;
		const out = await advanceTask(task);
		if (out.ok) {
			await invalidateAll();
			showRecurringSkipFeedback(out.task);
		} else {
			pushToast({ message: out.error });
		}
		busyId = null;
	}

	async function respond(task: FamilyTask, accept: boolean) {
		if (busyId) return;
		busyId = task.id;
		const out = await respondToTask(task, accept);
		if (out.ok) {
			pushToast({
				message: accept
					? `Accepted "${task.title}" — it's on your list.`
					: `Declined "${task.title}".`
			});
			await invalidateAll();
		} else {
			pushToast({ message: out.error });
		}
		busyId = null;
	}

	function openEdit(task: FamilyTask) {
		if (busyId || task.userId !== data.userId) return;
		editing = task;
	}

	function closeEdit() {
		editing = null;
	}

	async function saveEdit(draft: EditDraft) {
		if (!editing || !draft.title.trim() || editSaving) return;
		editSaving = true;
		try {
			const { payload } = buildEditPayload(editing, draft, data.userId);
			const res = await fetch(`/api/tasks/${editing.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
			if (res.ok) {
				closeEdit();
				await invalidateAll();
			} else {
				const j = await res.json().catch(() => ({}));
				pushToast({ message: j.error || "That didn't work. Try again." });
			}
		} catch {
			pushToast({ message: 'Network problem. Try again.' });
		} finally {
			editSaving = false;
		}
	}

	async function remove(task: FamilyTask) {
		if (busyId || task.userId !== data.userId) return;
		busyId = task.id;
		const out = await deleteTask(task);
		if (out.ok) {
			pushToast({ message: `Deleted "${task.title}".` });
			await invalidateAll();
		} else {
			pushToast({ message: out.error });
		}
		busyId = null;
		confirmDeleteId = null;
	}
</script>

<div class="mx-auto max-w-5xl p-4 sm:p-6">
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
		<TaskTagFilter bind:tagFilter />

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

		<!-- One column per person, and a column is a CARD (issue 124). Measured at
		     1440px: `family-tasks.html`'s `.board` resolved to four 296px columns,
		     each a bordered white card at 16px padding. The board was two 480px
		     columns of bare headings with no card around them. Steps down to one
		     column on a phone rather than becoming a horizontally scrolling board. -->
		{#if boardGroups.length > 0}
			<div
				class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
				role="region"
				aria-label="Open tasks by assignee"
			>
				{#each boardGroups as group (group.ownerId)}
					<section
						data-board-column
						class="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
						aria-label="{group.name}’s open tasks"
					>
						<div class="mb-3 flex items-center gap-2">
							<span
								class="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-extrabold {avatarColor(
									group.ownerId
								)}"
								aria-hidden="true"
							>
								{initial(group.name === 'You' ? 'Y' : group.name)}
							</span>
							<h3 class="min-w-0 flex-1 truncate text-[15px] font-extrabold text-slate-900">
								{group.name}
							</h3>
							<span class="shrink-0 text-xs font-bold text-slate-400">{group.tasks.length}</span>
						</div>
						<div class="space-y-1.5">
							{#each overdueFirst(group.tasks) as task (task.id)}
								<FamilyOpenTaskRow
									{task}
									currentUserId={data.userId}
									busy={busyId === task.id}
									confirmDelete={confirmDeleteId === task.id}
									onEdit={() => openEdit(task)}
									onToggle={() => toggle(task)}
									onAccept={() => respond(task, true)}
									onDecline={() => respond(task, false)}
									onAdvance={() => advance(task)}
									onBeginDelete={() => (confirmDeleteId = task.id)}
									onCancelDelete={() => (confirmDeleteId = null)}
									onDelete={() => remove(task)}
								/>
							{/each}
						</div>
					</section>
				{/each}
			</div>
		{/if}

		<FamilyCompletedTaskList tasks={completedTasks} />

		<!-- The approved "Nobody" card: a Task with `assignedTo IS NULL` belongs to
		     no column, so it gets its own card rather than being invisible or
		     filed under whoever created it. -->
		{#if unassignedTasks.length > 0}
			<!-- The prototype washes this card blush
			     (`family-tasks.html:99`: `linear-gradient(140deg, rgba(254,202,202,.35), #fff)`
			     over a `#fecaca` border). The app card was flat white on the same border. -->
			<section
				class="mt-5 rounded-2xl border border-red-200 bg-gradient-to-br from-red-100/40 to-white p-4 shadow-sm"
				aria-label="Nobody’s open tasks"
			>
				<h3 class="mb-2.5 flex items-center gap-2">
					<span class="text-sm font-semibold text-slate-900">Nobody</span>
					<span
						class="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700"
					>
						unassigned
					</span>
					<span class="text-sm font-normal text-slate-400">· {unassignedTasks.length}</span>
				</h3>
				<div class="space-y-1.5">
					{#each unassignedTasks as task (task.id)}
						<FamilyOpenTaskRow
							{task}
							currentUserId={data.userId}
							busy={busyId === task.id}
							confirmDelete={confirmDeleteId === task.id}
							onEdit={() => openEdit(task)}
							onToggle={() => toggle(task)}
							onAccept={() => respond(task, true)}
							onDecline={() => respond(task, false)}
							onAdvance={() => advance(task)}
							onBeginDelete={() => (confirmDeleteId = task.id)}
							onCancelDelete={() => (confirmDeleteId = null)}
							onDelete={() => remove(task)}
						/>
					{/each}
				</div>
				<p class="mt-2.5 text-xs leading-relaxed text-slate-500">
					Nobody is on the hook for these. Assign one to a member, or leave it here — it is still on
					the family's list either way.
				</p>
			</section>
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
					<FamilyTaskRow
						{task}
						variant="public"
						currentUserId={data.userId}
						canComplete={false}
						completeTitle=""
						assigneeName=""
						overdue={isOverdue(task)}
						busy={false}
						onToggle={() => {}}
						onAccept={() => {}}
						onDecline={() => {}}
						onAdvance={() => {}}
						onDelete={() => {}}
					/>
				{/each}
			</div>
		{/if}
	{/if}

	<!-- Edit task dialog (owner-only; mirrors My Tasks) -->
	{#if editing}
		{#key editing.id}
			<EditTaskDialog
				task={editing}
				currentUserId={data.userId}
				familyRoster={data.familyRoster ?? []}
				saving={editSaving}
				onSave={(draft) => saveEdit(draft)}
				onClose={closeEdit}
			/>
		{/key}
	{/if}
</div>
