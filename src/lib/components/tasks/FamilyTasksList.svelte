<script lang="ts">
	import FamilyTaskRow, { type FamilyTask } from './FamilyTaskRow.svelte';
	import { avatarColor } from '$lib/utils/avatarColor';

	interface Group {
		member: { userId: string; firstName?: string | null };
		tasks: FamilyTask[];
	}

	interface RowCallbacks {
		canComplete: (task: FamilyTask) => boolean;
		completeTitle: (task: FamilyTask) => string;
		assigneeName: (task: FamilyTask) => string;
		overdue: (task: FamilyTask) => boolean;
		busy: (task: FamilyTask) => boolean;
		onToggle: (task: FamilyTask) => void;
		onAccept: (task: FamilyTask) => void;
		onDecline: (task: FamilyTask) => void;
		onAdvance: (task: FamilyTask) => void;
		onDelete: (task: FamilyTask) => void;
	}

	interface Props extends RowCallbacks {
		byAssignee: Group[];
		unassignedTasks: FamilyTask[];
		completedTasks: FamilyTask[];
		currentUserId: string | undefined;
		memberName: (userId: string | null | undefined) => string;
	}

	let {
		byAssignee,
		unassignedTasks,
		completedTasks,
		currentUserId,
		memberName,
		canComplete,
		completeTitle,
		assigneeName,
		overdue,
		busy,
		onToggle,
		onAccept,
		onDecline,
		onAdvance,
		onDelete
	}: Props = $props();
</script>

<!-- Open tasks grouped by assignee -->
{#each byAssignee as group (group.member.userId)}
	<section class="mb-6">
		<h2
			class="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400"
		>
			<span
				class="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold {avatarColor(
					group.member.userId
				)}"
			>
				{group.member.firstName?.[0]?.toUpperCase() ?? '?'}
			</span>
			{memberName(group.member.userId)}
			<span class="font-normal normal-case text-slate-300">· {group.tasks.length}</span>
		</h2>
		<div class="space-y-1.5">
			{#each group.tasks as task (task.id)}
				<FamilyTaskRow
					{task}
					variant="open"
					{currentUserId}
					canComplete={canComplete(task)}
					completeTitle={completeTitle(task)}
					assigneeName={assigneeName(task)}
					overdue={overdue(task)}
					busy={busy(task)}
					onToggle={() => onToggle(task)}
					onAccept={() => onAccept(task)}
					onDecline={() => onDecline(task)}
					onAdvance={() => onAdvance(task)}
					onDelete={() => onDelete(task)}
				/>
			{/each}
		</div>
	</section>
{/each}

{#if unassignedTasks.length > 0}
	<section class="mb-6">
		<h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
			Unassigned
			<span class="font-normal normal-case text-slate-300">· {unassignedTasks.length}</span>
		</h2>
		<div class="space-y-1.5">
			{#each unassignedTasks as task (task.id)}
				<FamilyTaskRow
					{task}
					variant="open"
					{currentUserId}
					canComplete={canComplete(task)}
					completeTitle={completeTitle(task)}
					assigneeName={assigneeName(task)}
					overdue={overdue(task)}
					busy={busy(task)}
					onToggle={() => onToggle(task)}
					onAccept={() => onAccept(task)}
					onDecline={() => onDecline(task)}
					onAdvance={() => onAdvance(task)}
					onDelete={() => onDelete(task)}
				/>
			{/each}
		</div>
	</section>
{/if}

<!-- Completed -->
{#if completedTasks.length > 0}
	<h2 class="mb-2 mt-8 text-xs font-semibold uppercase tracking-wide text-slate-400">
		Completed ({completedTasks.length})
	</h2>
	<div class="space-y-1.5">
		{#each completedTasks as task (task.id)}
			<FamilyTaskRow
				{task}
				variant="completed"
				{currentUserId}
				canComplete={canComplete(task)}
				completeTitle="Mark incomplete"
				assigneeName={assigneeName(task)}
				overdue={false}
				busy={busy(task)}
				onToggle={() => onToggle(task)}
				onAccept={() => onAccept(task)}
				onDecline={() => onDecline(task)}
				onAdvance={() => onAdvance(task)}
				onDelete={() => onDelete(task)}
			/>
		{/each}
	</div>
{/if}
