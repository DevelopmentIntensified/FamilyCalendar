<script lang="ts">
	import TaskQuickAddHelp from '$lib/components/TaskQuickAddHelp.svelte';

	interface Props {
		taskTitle: string;
		taskVisibility: string;
		taskDueDate: string;
		taskError: string | null;
	}

	let {
		taskTitle = $bindable(),
		taskVisibility = $bindable(),
		taskDueDate = $bindable(),
		taskError
	}: Props = $props();
</script>

<div>
	<div class="mb-1 flex items-center justify-between gap-2">
		<label for="task-title" class="block text-sm font-medium text-slate-700">Task Title *</label>
		<TaskQuickAddHelp />
	</div>
	<input
		id="task-title"
		type="text"
		bind:value={taskTitle}
		placeholder="e.g., Pay water bill — or try &quot;#private tomorrow @family&quot;"
		required
		class="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
	/>
	{#if taskError}
		<p class="mt-1 text-xs text-red-600" role="alert">{taskError}</p>
	{/if}
</div>

<div>
	<label for="task-visibility" class="mb-1 block text-sm font-medium text-slate-700"
		>Visibility</label
	>
	<select
		id="task-visibility"
		bind:value={taskVisibility}
		class="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
	>
		<option value="public">🌐 Public — family can see it (read-only)</option>
		<option value="private">🔒 Private — only you and the assignee</option>
	</select>
	<p class="mt-1 text-xs text-slate-400">
		A <span class="font-mono">#public</span>/<span class="font-mono">#private</span>
		tag in the title wins over this.
	</p>
</div>

<div>
	<label for="task-due-date" class="mb-1 block text-sm font-medium text-slate-700">Due Date</label>
	<input
		id="task-due-date"
		type="date"
		bind:value={taskDueDate}
		class="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
	/>
	<p class="mt-1 text-xs text-slate-400">Optional — shows as a dashed chip on its due day.</p>
</div>
