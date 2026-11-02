<script lang="ts">
	import { CATEGORY_MAX } from '$lib/utils/taskCategory';

	/** #280 category combobox: the viewer's list as suggestions, free entry,
	 * and a clear button. One-way `value` + `onChange` (#200: no bind:). */
	interface Props {
		id: string;
		value: string;
		categories: string[];
		onChange: (value: string) => void;
		label?: string;
		compact?: boolean;
	}

	let { id, value, categories, onChange, label = 'Category', compact = false }: Props = $props();

	let listId = $derived(`${id}-options`);
</script>

<div>
	<label
		for={id}
		class={compact
			? 'mb-0.5 block text-xs text-slate-500'
			: 'mb-1 block text-sm font-medium text-slate-700'}>{label}</label
	>
	<div class="relative">
		<input
			{id}
			type="text"
			list={listId}
			{value}
			maxlength={CATEGORY_MAX}
			autocomplete="off"
			placeholder={categories.length ? 'Pick or type a category' : 'e.g. Work, Home'}
			oninput={(e) => onChange(e.currentTarget.value)}
			class="w-full rounded-lg border border-slate-300 bg-white py-2 pl-3 pr-8 text-sm text-slate-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
		/>
		{#if value.trim()}
			<button
				type="button"
				onclick={() => onChange('')}
				aria-label="Clear category"
				title="Clear category"
				class="absolute inset-y-0 right-1 my-auto flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
			>
				✕
			</button>
		{/if}
		<datalist id={listId}>
			{#each categories as name (name)}
				<option value={name}></option>
			{/each}
		</datalist>
	</div>
</div>
