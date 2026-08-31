<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import MentionInput from '$lib/components/MentionInput.svelte';
	import { avatarColor } from '$lib/utils/avatarColor';
	import { parseTaskQuickAdd } from '$lib/utils/taskQuickAdd';

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
	}[];
	export let members: { userId: string; firstName: string; lastName: string }[];
	export let meId: string;
	/** Family that created tasks post to when added from the board. */
	export let familyId: string;
	export let doneToday: number = 0;
	export let openToday: number = 0;
	export let weekStreak: number = 0;

	let quickTitle = '';
	let busy: string | null = null;

	async function addQuickTask() {
		if (!quickTitle.trim() || busy) return;
		busy = 'new';
		try {
			const parsed = parseTaskQuickAdd(quickTitle, { members });
			const res = await fetch('/api/tasks', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: parsed.title,
					dueDate: parsed.dueDate,
					familyId,
					assignedTo: parsed.assignedTo ?? meId,
					priority: parsed.priority
				})
			});
			if (res.ok) {
				quickTitle = '';
				await invalidateAll();
			}
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
		return name === 'You' ? 'Y' : name[0]?.toUpperCase() ?? '?';
	}

	function ownerId(t: (typeof tasks)[number]): string {
		return t.assignedTo ?? t.userId;
	}

	function dueLabel(due: string | null): string {
		if (!due) return '';
		const d = new Date(due);
		return isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	function dueTone(due: string | null): string {
		if (!due) return '';
		if (new Date(due).getTime() < new Date().setHours(0, 0, 0, 0)) return 'bg-red-100 text-red-700';
		return 'bg-slate-100 text-slate-600';
	}

	const PRIORITY_DOT: Record<string, string> = {
		high: 'bg-rose-500',
		normal: 'bg-sky-400',
		low: 'bg-slate-300'
	};

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

	async function toggleTask(taskId: string) {
		if (busy) return;
		busy = taskId;
		try {
			await fetch(`/api/tasks/${taskId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ toggleComplete: true })
			});
			await invalidateAll();
		} finally {
			busy = null;
		}
	}
</script>

<div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
	<h2 class="mb-3 text-sm font-semibold text-slate-900">Family Task Board</h2>

	<div class="mb-3 flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
		<span class="text-xs text-slate-500">
			{doneToday} done today · {openToday} open · {weekStreak > 0
				? `${weekStreak}-week streak`
				: 'no streak yet'}
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
		class="mb-3 flex gap-2"
	>
		<div class="min-w-0 flex-1">
			<MentionInput
				bind:value={quickTitle}
				{members}
				placeholder="Add a family task… try &quot;saturday for Dad&quot;"
			/>
		</div>
		<button
			type="submit"
			disabled={!quickTitle.trim() || busy === 'new'}
			class="shrink-0 rounded-lg bg-primary-600 px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
		>
			Add
		</button>
	</form>

	{#if groups.length === 0}
		<p class="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-400">
			No open family tasks
		</p>
	{:else}
		<div class="space-y-3">
			{#each groups as group (group.userId)}
				<section>
					<h3
						class="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400"
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
							<div class="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2.5">
								<button
									type="button"
									onclick={() => toggleTask(task.id)}
									disabled={busy === task.id}
									class="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-slate-300 transition-colors enabled:hover:border-primary-500 disabled:opacity-40"
									title="Mark done"
									aria-label="Mark done: {task.title}"
								><span class="absolute -inset-2" aria-hidden="true"></span></button>
								<span
									class="h-2 w-2 shrink-0 rounded-full {PRIORITY_DOT[task.priority] ?? 'bg-slate-300'}"
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