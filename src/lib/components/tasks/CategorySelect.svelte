<script lang="ts">
	import { CATEGORY_MAX } from '$lib/utils/taskCategory';

	/** #319 category dropdown: the viewer's saved names plus an explicit
	 * `+ Add new…` path. The typed name is emitted as `value` and rides the
	 * task save (`ensureTaskCategory` creates it server-side) — no second
	 * request here. One-way `value` + `onChange` (#200: no bind:). */
	interface Props {
		id: string;
		value: string;
		categories: string[];
		onChange: (value: string) => void;
		label?: string;
		compact?: boolean;
	}

	let { id, value, categories, onChange, label = 'Category', compact = false }: Props = $props();

	const ADD_NEW = '__add_new__';

	/** Names the picker lists (server list order, blanks dropped). */
	let names = $derived(categories.filter((c) => c.trim()));

	/** A category the task already carries but the list doesn't (e.g. it
	 * came from someone else's list) must still show as the selection. */
	let customValue = $derived(
		value.trim() && !names.some((n) => n.toLowerCase() === value.trim().toLowerCase())
			? value
			: ''
	);

	let adding = $state(false);
	/** Value to restore if the add-new field is cancelled. */
	let beforeAdd = $state('');
	let draft = $state('');

	// The native <select> shows the sentinel after "Add new…"; keep the
	// rendered selection on the real value while the text field is open.
	let selected = $state(value);
	let prevValue = value;
	$effect.pre(() => {
		selected = value;
		// A parent reset (e.g. after a successful add) closes the composer.
		if (adding && value !== prevValue && !value.trim()) {
			adding = false;
			draft = '';
		}
		prevValue = value;
	});

	function handleSelect(e: Event) {
		const next = (e.currentTarget as HTMLSelectElement).value;
		if (next === ADD_NEW) {
			beforeAdd = value;
			draft = '';
			adding = true;
			selected = value;
			return;
		}
		adding = false;
		draft = '';
		selected = next;
		onChange(next);
	}

	function clear() {
		adding = false;
		draft = '';
		selected = '';
		onChange('');
	}

	function cancelAdd() {
		adding = false;
		draft = '';
		selected = beforeAdd;
		onChange(beforeAdd);
	}
</script>

<div>
	<label
		for={id}
		class={compact
			? 'mb-0.5 block text-xs text-slate-500'
			: 'mb-1 block text-sm font-medium text-slate-700'}>{label}</label
	>
	<div class="flex items-center gap-1.5">
		<select
			{id}
			bind:value={selected}
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
		{#if value.trim() && !adding}
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
				oninput={(e) => {
					draft = e.currentTarget.value;
					onChange(draft);
				}}
				maxlength={CATEGORY_MAX}
				autocomplete="off"
				placeholder="New category name"
				aria-label="New category name"
				class="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
			/>
			<button
				type="button"
				onclick={cancelAdd}
				class="shrink-0 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
			>
				Cancel
			</button>
		</div>
	{/if}
</div>
