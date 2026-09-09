<script lang="ts">
	interface Props {
		isEditMode: boolean;
		entryType: string;
		submitting: boolean;
		canSubmit: boolean;
		submitBlockedReason?: string;
		onDelete: () => void;
		onClose: () => void;
		onClear: () => void;
	}

	let {
		isEditMode,
		entryType,
		submitting,
		canSubmit,
		submitBlockedReason,
		onDelete,
		onClose,
		onClear
	}: Props = $props();
</script>

<div
	class="flex shrink-0 items-center justify-end gap-2 border-t border-slate-100 px-5 py-3"
	style="padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 1.25rem)"
>
	{#if isEditMode}
		<button
			type="button"
			on:click={onDelete}
			class="mr-auto rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
			>Delete</button
		>
	{/if}
	<button
		type="button"
		on:click={onClose}
		class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
		>Cancel</button
	>
	{#if !isEditMode && entryType === 'event'}
		<button
			type="button"
			on:click={onClear}
			class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
			>Clear</button
		>
	{/if}
	<button
		type="submit"
		form="event-form"
		class="rounded-lg bg-primary-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
		title={submitBlockedReason}
		disabled={!canSubmit || submitting}
	>
		{#if submitting}
			<div class="flex items-center gap-2">
				<div
					class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
				></div>
				{isEditMode ? 'Updating...' : entryType === 'task' ? 'Adding...' : 'Creating...'}
			</div>
		{:else}
			{isEditMode ? 'Update' : entryType === 'task' ? 'Add Task' : 'Create'}
		{/if}
	</button>
</div>
