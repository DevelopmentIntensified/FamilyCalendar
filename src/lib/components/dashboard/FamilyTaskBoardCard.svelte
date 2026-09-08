<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import MentionInput from '$lib/components/MentionInput.svelte';
	import TaskQuickAddHelp from '$lib/components/TaskQuickAddHelp.svelte';
	import { avatarColor } from '$lib/utils/avatarColor';
	import { parseTaskQuickAdd } from '$lib/utils/taskQuickAdd';
	import { dueTone, priorityDot } from '$lib/utils/priorityTone';
	import { showRecurringCompleteFeedback } from '$lib/client/taskFeedback';
	import { pushToast } from '$lib/client/toasts';

	export let tasks: {
		id: string;
		title: string;
		dueDate: string | null;
		completedAt: string | null;
		priority: string;
		assignedTo: string | null;
		assignmentStatus: string | null;
		userId: string;
		assigneeFirstName?: string | null;
		assigneeLastName?: string | null;
		creatorFirstName?: string | null;
		recurrenceFrequency?: string | null;
		recurrenceInterval?: number | null;
	}[];
	export let members: { userId: string; firstName: string; lastName: string }[];
	export let meId: string;
	/** Family that created tasks post to when added from the board. */
	export let familyId: string;
	export let openToday: number = 0;
	export let weekStreak: number = 0;

	let quickTitle = '';
	let quickError = '';
	let busy: string | null = null;

	async function addQuickTask() {
		if (!quickTitle.trim() || busy) return;
		busy = 'new';
		const title = quickTitle.trim();
		quickError = '';
		try {
			const parsed = parseTaskQuickAdd(quickTitle, { members });
			// Unknown/ambiguous @member: never silently dropped — block the
			// create and keep the input so the user can fix the name.
			if (parsed.unknownMember) {
				quickError = `Unknown member ${parsed.unknownMember} — check the spelling or pick someone from your family.`;
				return;
			}
			const res = await fetch('/api/tasks', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: parsed.title,
					dueDate: parsed.dueDate,
					familyId,
					assignedTo: parsed.assignedTo ?? meId,
					priority: parsed.priority,
					tags: parsed.tags,
					recurrenceFrequency: parsed.recurrenceFrequency,
					recurrenceInterval: parsed.recurrenceInterval
				})
			});
			if (res.ok) {
				quickTitle = '';
				pushToast({ message: `Added "${parsed.title}" to the family board.` });
				await invalidateAll();
			} else {
				const j = await res.json().catch(() => ({}));
				pushToast({ message: j.error || `Couldn't add "${title}" — try again.` });
			}
		} catch {
			pushToast({ message: `Couldn't add "${title}" — check your connection.` });
		} finally {
			busy = null;
		}
	}

	function memberName(userId: string | null): string {
		if (!userId) return 'Unassigned';
		if (userId === meId) return 'You';
		const m = members.find((mm) => mm.userId === userId);
		if (m) return `${m.firstName} ${m.lastName}`.trim();
		return userId.slice(0, 8);
	}

	function initial(userId: string): string {
		const name = memberName(userId);
		return name === 'You' ? 'Y' : (name[0]?.toUpperCase() ?? '?');
	}

	function ownerId(t: (typeof tasks)[number]): string {
		return t.assignedTo ?? t.userId;
	}

	function dueLabel(due: string | null): string {
		if (!due) return '';
		const d = new Date(due);
		return isNaN(d.getTime())
			? ''
			: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	/** Due/priority tones live in the shared priorityTone module. */

	$: groups = [...new Set(tasks.map(ownerId))]
		.map((uid) => ({
			userId: uid,
			name: memberName(uid),
			tasks: tasks.filter((t) => ownerId(t) === uid)
		}))
		.sort((a, b) => {
			if (a.userId === meId) return -1;
			if (b.userId === meId) return 1;
			return a.name.localeCompare(b.name);
		});

	async function toggleTask(task: (typeof tasks)[number]) {
		if (busy) return;
		busy = task.id;
		try {
			const res = await fetch(`/api/tasks/${task.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ toggleComplete: true })
			});
			if (res.ok) {
				const j = await res.json().catch(() => ({}));
				if (task.recurrenceFrequency) {
					// Recurring path gets ONLY the streak+Undo toast — no generic toast.
					await invalidateAll();
					showRecurringCompleteFeedback(j.task, task.dueDate);
				} else {
					pushToast({ message: `"${task.title}" marked done.` });
					await invalidateAll();
				}
			} else {
				const j = await res.json().catch(() => ({}));
				pushToast({ message: j.error || `Couldn't update "${task.title}" — try again.` });
			}
		} catch {
			pushToast({ message: `Couldn't update "${task.title}" — check your connection.` });
		} finally {
			busy = null;
		}
	}
</script>

<div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
	<h2 class="mb-2.5 text-sm font-semibold text-slate-900 sm:mb-3">Family Task Board</h2>

	<div
		class="mb-2.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b border-slate-100 pb-2.5 sm:mb-3 sm:pb-3"
	>
		<span class="text-xs text-slate-500">
			{openToday} open · {weekStreak > 0
				? `${weekStreak}-week streak`
				: "Start a streak — check off today's tasks 🔥"}
		</span>
		<a
			href="/calendar/tasks"
			class="shrink-0 text-xs font-semibold text-primary-600 hover:text-primary-700 hover:underline"
		>
			View all tasks
		</a>
	</div>

	<form
		onsubmit={(e) => {
			e.preventDefault();
			addQuickTask();
		}}
		class="mb-3 flex flex-col gap-2 sm:flex-row sm:gap-2"
	>
		<div class="flex min-w-0 flex-wrap items-center gap-2">
			<div class="min-w-0 flex-1">
				<MentionInput
					bind:value={quickTitle}
					{members}
					placeholder="Add a family task… try &quot;saturday for Dad&quot;"
				/>
			</div>
			<TaskQuickAddHelp />
			<button
				type="submit"
				disabled={!quickTitle.trim() || busy === 'new'}
				class="shrink-0 rounded-lg bg-primary-600 px-3 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50 sm:px-3.5 sm:py-2.5"
			>
				Add
			</button>
		</div>
		{#if quickError}
			<p class="text-xs text-red-600" role="alert">{quickError}</p>
		{/if}
	</form>

	{#if groups.length === 0}
		<div
			class="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-400"
		>
			<p>No open family tasks — enjoy the calm 👪.</p>
			<a
				href="/calendar/tasks"
				class="mt-1 inline-block text-xs font-semibold text-primary-600 hover:text-primary-700 hover:underline"
			>
				View all tasks →
			</a>
		</div>
	{:else}
		<div class="space-y-2.5">
			{#each groups as group (group.userId)}
				<section>
					<h3
						class="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400"
					>
						<span
							class="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold {avatarColor(
								group.userId
							)}"
						>
							{initial(group.userId)}
						</span>
						{group.name}
						<span class="font-normal normal-case text-slate-300">· {group.tasks.length}</span>
					</h3>
					<div class="space-y-1.5">
						{#each group.tasks as task (task.id)}
							<div
								class="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/50 px-2.5 py-2 sm:gap-3 sm:rounded-xl sm:px-3 sm:py-2.5"
							>
								<button
									type="button"
									onclick={() => toggleTask(task)}
									disabled={busy === task.id}
									class="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-slate-300 transition-colors enabled:hover:border-primary-500 disabled:opacity-40"
									title="Mark done"
									aria-label="Mark done: {task.title}"
									><span class="absolute -inset-2" aria-hidden="true"></span></button
								>
								<span
									class="h-2 w-2 shrink-0 rounded-full {priorityDot(task.priority) ||
										'bg-slate-300'}"
									title="{task.priority} priority"
								></span>
								<p class="min-w-0 flex-1 truncate text-sm text-slate-800">{task.title}</p>
								{#if task.dueDate}
									<span
										class="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium {dueTone(
											task.dueDate
										)}"
									>
										{dueLabel(task.dueDate)}
									</span>
								{/if}
							</div>
						{/each}
					</div>
				</section>
			{/each}
		</div>
	{/if}
</div>
