<script lang="ts">
	import MentionInput from '$lib/components/MentionInput.svelte';
	import TaskQuickAddPreview from '$lib/components/TaskQuickAddPreview.svelte';
	import { formatDue } from '$lib/utils/taskDisplay';
	import { parseTaskQuickAdd, TASK_QUICK_ADD_PRIORITY_RE } from '$lib/utils/taskQuickAdd';

	interface Props {
		familyId: string;
		members: { userId: string; firstName: string; lastName: string }[];
		currentUserId: string | undefined;
		memberName: (userId: string | null | undefined) => string;
		onAdded: () => void;
	}

	let { familyId, members, currentUserId, memberName, onAdded }: Props = $props();

	let newTitle = $state('');
	let newDueDate = $state('');
	let newAssignedTo = $state('');
	let newPriority = $state('normal');
	let adding = $state(false);

	/** End-of-today ISO slot — used when a recurrence is typed with no due date. */
	function endOfDayIso(): string {
		const d = new Date();
		d.setHours(23, 59, 0, 0);
		return d.toISOString();
	}

	function inputToIso(value: string): string | null {
		if (!value) return null;
		const [y, m, d] = value.split('-').map(Number);
		return new Date(y, m - 1, d, 23, 59, 0, 0).toISOString();
	}

	/** Live parse of the title being typed, so chips preview what gets captured. */
	let quick = $derived(newTitle.trim() ? parseTaskQuickAdd(newTitle, { members }) : null);

	async function addTask() {
		if (!newTitle.trim() || adding) return;
		adding = true;
		try {
			// Quick-add: typed dates/priorities/assignees ("saturday",
			// "high priority", "for Dad") win over the explicit pickers;
			// a bare title keeps whatever the pickers say.
			const parsed = parseTaskQuickAdd(newTitle, { members });
			// A cadence ("every 2 weeks") with no picked date still needs a cursor.
			const due =
				parsed.dueDate ??
				inputToIso(newDueDate) ??
				(parsed.recurrenceFrequency ? endOfDayIso() : null);
			const res = await fetch('/api/tasks', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: parsed.title,
					dueDate: due,
					familyId,
					assignedTo: parsed.assignedTo ?? (newAssignedTo || currentUserId),
					priority: TASK_QUICK_ADD_PRIORITY_RE.test(newTitle) ? parsed.priority : newPriority,
					tags: parsed.tags,
					recurrenceFrequency: parsed.recurrenceFrequency,
					recurrenceInterval: parsed.recurrenceInterval
				})
			});
			if (res.ok) {
				newTitle = '';
				newDueDate = '';
				newAssignedTo = '';
				newPriority = 'normal';
				onAdded();
			}
		} finally {
			adding = false;
		}
	}
</script>

<form
	onsubmit={(e) => {
		e.preventDefault();
		addTask();
	}}
	class="mb-8 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
>
	<div class="flex flex-col gap-2 sm:flex-row">
		<div class="flex-1">
			<MentionInput bind:value={newTitle} {members} placeholder="Add a family task..." />
			<TaskQuickAddPreview parsed={quick} {memberName} {formatDue} />
		</div>
		<input
			type="date"
			bind:value={newDueDate}
			aria-label="Due date"
			class="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-600 sm:w-[10.5rem]"
		/>
		<select
			bind:value={newAssignedTo}
			aria-label="Assign to"
			class="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700"
		>
			<option value="">Me</option>
			{#each members.filter((m) => m.userId !== currentUserId) as m (m.userId)}
				<option value={m.userId}>{m.firstName} {m.lastName}</option>
			{/each}
		</select>
		<select
			bind:value={newPriority}
			aria-label="Priority"
			class="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700"
		>
			<option value="low">Low</option>
			<option value="normal">Normal</option>
			<option value="high">High</option>
		</select>
		<button
			type="submit"
			disabled={adding || !newTitle.trim()}
			class="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
		>
			Add
		</button>
	</div>
	<p class="mt-2 text-xs text-slate-400">
		Try "clean gutters saturday", "high priority pay rent for Dad", "every 2 weeks" — dates,
		priority, repeats and assignees can be typed right in the title. Otherwise tasks go to you (or
		whoever you pick) and wait for their confirmation.
	</p>
</form>
