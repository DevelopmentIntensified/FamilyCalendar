<script lang="ts">
	interface Props {
		busy: boolean;
		showDeleteConfirm: boolean;
		canSkip: boolean;
		onAdvance: () => void;
		onRemove: () => void;
		onBeginDelete: () => void;
		onCancelDelete: () => void;
		onToggleComplete: () => void;
	}

	let {
		busy,
		showDeleteConfirm,
		canSkip,
		onAdvance,
		onRemove,
		onBeginDelete,
		onCancelDelete,
		onToggleComplete
	}: Props = $props();
</script>

<div class="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
	{#if canSkip}
		<button
			type="button"
			onclick={onAdvance}
			disabled={busy}
			class="rounded-lg border border-purple-200 px-4 py-2 text-sm font-medium text-purple-700 hover:bg-purple-50 disabled:opacity-50"
		>
			Skip occurrence
		</button>
	{/if}
	{#if showDeleteConfirm}
		<div class="flex items-center gap-2">
			<span class="text-sm text-red-600">Delete this task?</span>
			<button
				type="button"
				onclick={onRemove}
				disabled={busy}
				class="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
			>
				{busy ? 'Deleting…' : 'Yes, delete'}
			</button>
			<button
				type="button"
				onclick={onCancelDelete}
				disabled={busy}
				class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
			>
				Cancel
			</button>
		</div>
	{:else}
		<button
			type="button"
			onclick={onBeginDelete}
			disabled={busy}
			class="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
		>
			Delete
		</button>
	{/if}
	<button
		type="button"
		onclick={onToggleComplete}
		disabled={busy}
		class="rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
	>
		{busy ? 'Working…' : 'Mark complete'}
	</button>
</div>
