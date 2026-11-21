<!--
	The edit form's delete ask: "This occurrence" / "Whole series" on a
	recurring occurrence, one Delete on a one-off, both disabled while the
	DELETE is in flight (issue 015), and the attached-task warning.

	Doc: ../../README.md#public-interface
-->
<script lang="ts">
	interface Props {
		isRecurringOccurrence: boolean;
		attachedTaskCount: number;
		deleting: boolean;
		ondeleteoccurrence: () => void;
		ondeleteseries: () => void;
		ondeletesingle: () => void;
		oncancel: () => void;
	}

	let {
		isRecurringOccurrence,
		attachedTaskCount,
		deleting,
		ondeleteoccurrence,
		ondeleteseries,
		ondeletesingle,
		oncancel
	}: Props = $props();
</script>

<div class="mx-5 mb-3 rounded-lg border border-red-200 bg-red-50 p-3" data-testid="delete-ask">
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
				disabled={deleting}
				onclick={ondeleteoccurrence}
				class="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
			>
				This occurrence
			</button>
			<button
				type="button"
				disabled={deleting}
				onclick={ondeleteseries}
				class="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
			>
				Whole series
			</button>
		{:else}
			<button
				type="button"
				disabled={deleting}
				onclick={ondeletesingle}
				class="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
			>
				{deleting ? 'Deleting…' : 'Delete'}
			</button>
		{/if}
		<button
			type="button"
			disabled={deleting}
			onclick={oncancel}
			class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
		>
			Cancel
		</button>
	</div>
</div>
