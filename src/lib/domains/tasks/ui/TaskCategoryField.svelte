<!--
	The category picker: the viewer's saved names plus an explicit "+ Add new…"
	composer. The typed name is emitted as `value` and rides the Task save (the
	server creates it) — no second request here. One-way `value` + `onchange`
	(#200: no `bind:`).

	Legacy reference: `components/tasks/CategorySelect.svelte`.
-->
<script lang="ts">
	import { taskCategoryNameError } from '../tasks.editor.rules';

	interface Props {
		id: string;
		value: string;
		/** The viewer's saved category names. */
		categories: readonly string[];
		onchange: (value: string) => void;
		label?: string;
		compact?: boolean;
		maxLength?: number;
	}

	let { id, value, categories, onchange, label = 'Category', compact = false, maxLength = 80 }: Props =
		$props();

	const ADD_NEW = '__add_new__';

	const names = $derived(categories.filter((name) => name.trim()));

	/** A name the Task carries but the list does not still has to show. */
	const customValue = $derived(
		value.trim() && !names.some((name) => name.toLowerCase() === value.trim().toLowerCase())
			? value
			: ''
	);

	let adding = $state(false);
	let draft = $state('');
	let beforeAdd = $state('');

	function handleSelect(event: Event) {
		const next = (event.currentTarget as HTMLSelectElement).value;
		if (next === ADD_NEW) {
			beforeAdd = value;
			draft = '';
			adding = true;
			return;
		}
		adding = false;
		onchange(next);
	}

	function startAdd() {
		beforeAdd = value;
		draft = '';
		adding = true;
	}

	function cancelAdd() {
		adding = false;
		draft = '';
		onchange(beforeAdd);
	}

	function clear() {
		adding = false;
		draft = '';
		onchange('');
	}
</script>

<div>
	<label
		for={id}
		class={compact ? 'mb-0.5 block text-xs text-slate-500' : 'mb-1 block text-sm font-medium text-slate-700'}
		>{label}</label
	>
	<div class="flex items-center gap-1.5">
		<select
			{id}
			value={adding ? ADD_NEW : value}
			onchange={handleSelect}
			class="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
		>
			<option value="">No category</option>
			{#each names as name (name)}
				<option value={name}>{name}</option>
			{/each}
			{#if customValue}
				<option value={customValue}>{customValue}</option>
			{/if}
			<option value={ADD_NEW}>+ Add new…</option>
		</select>
		{#if adding}
			<button
				type="button"
				onclick={cancelAdd}
				class="shrink-0 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
				aria-label="Cancel new category"
			>
				✕
			</button>
		{:else if value.trim()}
			<button
				type="button"
				onclick={clear}
				aria-label="Clear category"
				title="Clear category"
				class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
			>
				✕
			</button>
		{/if}
	</div>
	{#if adding}
		<div class="mt-1.5 flex items-center gap-1.5">
			<input
				type="text"
				value={draft}
				oninput={(event) => {
					draft = event.currentTarget.value;
					onchange(draft);
				}}
				maxlength={maxLength}
				autocomplete="off"
				placeholder="New category name"
				aria-label="New category name"
				class="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
			/>
			{#if taskCategoryNameError(draft, maxLength)}
				<span class="shrink-0 text-xs text-red-600">{taskCategoryNameError(draft, maxLength)}</span>
			{:else}
				<button
					type="button"
					onclick={() => onchange(draft.trim())}
					class="shrink-0 rounded-lg bg-primary-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-primary-700"
				>
					Use
				</button>
			{/if}
		</div>
	{/if}
</div>
