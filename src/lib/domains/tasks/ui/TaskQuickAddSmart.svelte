<!--
	The smart-task templates inside the "✨ Smart tasks" disclosure: one
	collapsible group per category, one chip per template. `TaskQuickAdd`
	imports it lazily the first time the disclosure opens, so the closed card
	every tasks page ships carries neither the template catalogue nor these
	rows (ADR 0010). Behaviour stays in `TaskQuickAddState.addSmartTask`.
-->
<script lang="ts">
	import {
		TASK_SMART_CATEGORIES,
		TASK_SMART_TEMPLATES,
		type TaskSmartCategory
	} from '../tasks.smart.rules';
	import type { TaskQuickAddState } from '../tasks.quickadd.state.svelte';

	interface Props {
		state: TaskQuickAddState;
	}

	let { state: quickAdd }: Props = $props();

	const categoriesMeta = (Object.keys(TASK_SMART_CATEGORIES) as TaskSmartCategory[]).map((key) => ({
		key,
		meta: TASK_SMART_CATEGORIES[key],
		templates: TASK_SMART_TEMPLATES.filter((template) => template.category === key)
	}));
</script>

<div class="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
	{#each categoriesMeta as category, index (category.key)}
		<details class="mb-1 last:mb-0" open={index === 0}>
			<summary
				class="cursor-pointer select-none rounded-lg px-2 py-1.5 text-sm font-medium text-slate-700 hover:bg-white"
			>
				{category.meta.icon}
				{category.meta.label}
				<span class="ml-1 text-xs font-normal text-slate-400">({category.templates.length})</span>
			</summary>
			<div class="mt-1 flex flex-wrap gap-1.5 pl-2">
				{#each category.templates as template (template.id)}
					<button
						type="button"
						onclick={() => quickAdd.addSmartTask(template)}
						disabled={quickAdd.busyTemplateId === template.id}
						title={quickAdd.cadenceNote(template)}
						class="rounded-full border px-2.5 py-1 text-xs font-medium transition-colors hover:opacity-80 disabled:opacity-50 {category
							.meta.color}"
					>
						{template.name}
					</button>
				{/each}
			</div>
		</details>
	{/each}
</div>
