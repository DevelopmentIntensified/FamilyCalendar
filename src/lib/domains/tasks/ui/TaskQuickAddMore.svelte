<!--
	The "More" extras under the New task row: the category picker and the
	visibility select. `TaskQuickAdd` imports it lazily the first time "More"
	opens, so the closed card every tasks page ships carries neither the picker
	nor its markup (ADR 0010). Behaviour stays in `TaskQuickAddState`.
-->
<script lang="ts">
	import type { TaskQuickAddState } from '../tasks.quickadd.state.svelte';
	import TaskCategoryField from './TaskCategoryField.svelte';

	interface Props {
		state: TaskQuickAddState;
		/** The viewer's category names for the picker. */
		categories: readonly string[];
	}

	let { state: quickAdd, categories }: Props = $props();
</script>

<div class="mt-2 max-w-xs">
	<TaskCategoryField
		id="add-task-category"
		value={quickAdd.category}
		{categories}
		compact
		onchange={(value) => quickAdd.setCategory(value)}
	/>
</div>
<label class="mt-2 flex items-center gap-2 text-xs text-slate-500">
	Who can see this
	<select
		value={quickAdd.visibility}
		onchange={(event) =>
			quickAdd.setVisibility(event.currentTarget.value === 'public' ? 'public' : 'private')}
		aria-label="Who can see this task"
		class="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 focus:border-primary-500 focus:outline-none"
	>
		<option value="private">Private</option>
		<option value="public">Public</option>
	</select>
</label>
