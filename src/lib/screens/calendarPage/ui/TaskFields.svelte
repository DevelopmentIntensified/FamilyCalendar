<!--
	The create modal's Task half (legacy `EventTaskFields`): Title, Visibility,
	an optional Due Date and a Category. A `#public`/`#private` tag in the title
	wins over the select — the tasks grammar decides, this form only offers.
-->
<script lang="ts">
	import { TaskCategoryField, TaskQuickAddHelp } from '$lib/domains/tasks/ui';

	interface Props {
		title: string;
		visibility: string;
		dueDate: string;
		category: string;
		categories: readonly string[];
		error: string | null;
		ontitle: (value: string) => void;
		onvisibility: (value: string) => void;
		ondueDate: (value: string) => void;
		oncategory: (value: string) => void;
	}

	let {
		title,
		visibility,
		dueDate,
		category,
		categories,
		error,
		ontitle,
		onvisibility,
		ondueDate,
		oncategory
	}: Props = $props();

	const field =
		'mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500';
</script>

<div>
	<div class="mb-1 flex items-center justify-between gap-2">
		<label for="task-title" class="block text-sm font-medium text-slate-700">Task Title *</label>
		<TaskQuickAddHelp />
	</div>
	<input
		id="task-title"
		type="text"
		value={title}
		oninput={(event) => ontitle(event.currentTarget.value)}
		placeholder={'e.g., Pay water bill — or try "#private tomorrow @family"'}
		required
		class={field}
	/>
	{#if error}
		<p class="mt-1 text-xs text-red-600" role="alert">{error}</p>
	{/if}
</div>

<div>
	<label for="task-visibility" class="mb-1 block text-sm font-medium text-slate-700">Visibility</label>
	<select
		id="task-visibility"
		value={visibility}
		onchange={(event) => onvisibility(event.currentTarget.value)}
		class={field}
	>
		<option value="public">Public — family can see it (read-only)</option>
		<option value="private">Private — only you and the assignee</option>
	</select>
	<p class="mt-1 text-xs text-slate-400">
		A <span class="font-mono">#public</span>/<span class="font-mono">#private</span> tag in the title
		wins over this.
	</p>
</div>

<div>
	<label for="task-due-date" class="mb-1 block text-sm font-medium text-slate-700">Due Date</label>
	<input
		id="task-due-date"
		type="date"
		value={dueDate}
		oninput={(event) => ondueDate(event.currentTarget.value)}
		class={field}
	/>
	<p class="mt-1 text-xs text-slate-400">Optional — shows as a dashed chip on its due day.</p>
</div>

<TaskCategoryField
	id="task-category"
	value={category}
	{categories}
	onchange={oncategory}
/>
