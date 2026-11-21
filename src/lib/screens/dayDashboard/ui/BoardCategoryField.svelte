<!--
	The board quick-add's category box, in the screen's own chunk: the tasks
	page's picker lives behind `tasks/ui`, whose barrel carries every task
	screen (and the paste-a-list state) onto the dashboard's first paint. This
	is the legacy compact field (`components/tasks/CategoryField.svelte`)
	markup — suggestions, free entry, a clear button — so the board looks the
	same while paying for nothing else.

	One-way `value` + `onchange` (issue 200: no `bind:` on components).
-->
<script lang="ts">
	interface Props {
		id: string;
		value: string;
		categories: readonly string[];
		onchange: (value: string) => void;
		label?: string;
		compact?: boolean;
	}

	let { id, value, categories, onchange, label = 'Category', compact = false }: Props = $props();

	const listId = $derived(`${id}-options`);
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
			maxlength={80}
			autocomplete="off"
			placeholder={categories.length ? 'Pick or type a category' : 'e.g. Work, Home'}
			oninput={(event) => onchange(event.currentTarget.value)}
			class="w-full rounded-lg border border-slate-300 bg-white py-2 pl-3 pr-8 text-sm text-slate-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
		/>
		{#if value.trim()}
			<button
				type="button"
				onclick={() => onchange('')}
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
