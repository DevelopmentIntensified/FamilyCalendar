<!--
	The edit form's action bar: Delete event on the left (edit only), Cancel,
	Clear (create only) and the submit button. Submitting reads
	Updating.../Creating... and the button stays disabled until title + date are
	valid — the blocked reason rides the title attribute.

	The copy is the legacy e2e contract: `Delete event` and `Save Changes` are the
	names the journeys look for (`Button: has-text("Save Changes")`).

	Doc: ../../README.md#public-interface
-->
<script lang="ts">
	interface Props {
		isEdit: boolean;
		submitting: boolean;
		canSubmit: boolean;
		submitBlockedReason?: string;
		ondelete: () => void;
		onclose: () => void;
		onclear: () => void;
	}

	let { isEdit, submitting, canSubmit, submitBlockedReason, ondelete, onclose, onclear }: Props =
		$props();
</script>

<div
	class="flex shrink-0 items-center justify-end gap-2 border-t border-slate-100 px-5 py-3"
	style="padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 1.25rem)"
>
	{#if isEdit}
		<button
			type="button"
			onclick={ondelete}
			class="mr-auto rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
		>
			Delete event
		</button>
	{/if}
	<button
		type="button"
		onclick={onclose}
		class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
	>
		Cancel
	</button>
	{#if !isEdit}
		<button
			type="button"
			onclick={onclear}
			class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
		>
			Clear
		</button>
	{/if}
	<button
		type="submit"
		form="event-form"
		class="rounded-lg bg-primary-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
		title={submitBlockedReason}
		disabled={!canSubmit || submitting}
		data-testid="event-submit"
	>
		{#if submitting}
			<span class="flex items-center gap-2">
				<span
					class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
				></span>
				{isEdit ? 'Updating...' : 'Creating...'}
			</span>
		{:else}
			{isEdit ? 'Save Changes' : 'Create'}
		{/if}
	</button>
</div>
