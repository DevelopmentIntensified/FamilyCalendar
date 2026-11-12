<!--
	Two-step destructive action: the first click only asks (`Delete?` plus the
	confirm and cancel buttons), so one stray tap can never delete anything.
	Folds eight hand-written copies (TaskRow, TaskCompletedRow, FamilyOpenTaskRow,
	TaskDetailBar, EventModalBar, EventDeleteConfirm, AccountDangerSection,
	MemberChildTab); the look is TaskDetailBar's row.

	Doc: src/lib/kernel/README.md
-->
<script lang="ts">
	interface Props {
		label: string;
		confirmLabel?: string;
		cancelLabel?: string;
		onconfirm: () => void;
		disabled?: boolean;
		testid?: string;
	}

	let {
		label,
		confirmLabel = 'Yes, delete',
		cancelLabel = 'Cancel',
		onconfirm,
		disabled = false,
		testid
	}: Props = $props();

	let confirming = $state(false);
</script>

{#if confirming}
	<div class="flex flex-wrap items-center gap-2" data-testid={testid}>
		<span class="text-sm font-medium text-red-600">{label}?</span>
		<button
			type="button"
			onclick={() => {
				// Close the ask before running it, so a double click cannot fire twice.
				confirming = false;
				onconfirm();
			}}
			{disabled}
			class="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
		>
			{confirmLabel}
		</button>
		<button
			type="button"
			onclick={() => (confirming = false)}
			{disabled}
			class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
		>
			{cancelLabel}
		</button>
	</div>
{:else}
	<button
		type="button"
		onclick={() => (confirming = true)}
		{disabled}
		class="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
		data-testid={testid}
	>
		{label}
	</button>
{/if}
