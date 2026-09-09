<script lang="ts">
	interface Props {
		isRecurringOccurrence: boolean;
		attachedTaskCount: number;
		onDeleteOccurrence: () => void;
		onDeleteSeries: () => void;
		onDeleteSingle: () => void;
		onCancel: () => void;
	}

	let {
		isRecurringOccurrence,
		attachedTaskCount,
		onDeleteOccurrence,
		onDeleteSeries,
		onDeleteSingle,
		onCancel
	}: Props = $props();
</script>

<div class="mx-5 mb-3 rounded-lg border border-red-200 bg-red-50 p-3">
	<p class="text-sm font-medium text-red-700">Delete this event?</p>
	{#if attachedTaskCount > 0}
		<p class="mt-0.5 text-xs text-red-600">
			⚠️ {attachedTaskCount} attached task(s) will also be deleted.
		</p>
	{/if}
	<div class="mt-2 flex flex-wrap items-center gap-2">
		{#if isRecurringOccurrence}
			<button
				type="button"
				on:click={onDeleteOccurrence}
				class="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700"
			>
				This occurrence
			</button>
			<button
				type="button"
				on:click={onDeleteSeries}
				class="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700"
			>
				Whole series
			</button>
		{:else}
			<button
				type="button"
				on:click={onDeleteSingle}
				class="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700"
			>
				Delete
			</button>
		{/if}
		<button
			type="button"
			on:click={onCancel}
			class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
		>
			Cancel
		</button>
	</div>
</div>
