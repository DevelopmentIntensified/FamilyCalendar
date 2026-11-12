<!--
	Two-step destructive action: the first click only asks (`Delete?` plus the
	confirm and cancel buttons), so one stray tap can never delete anything.
	Folds five hand-written copies (TaskRow, TaskCompletedRow, FamilyOpenTaskRow,
	TaskDetailBar, and the family member-remove row in
	routes/(family)/family/[familyId]/+page.svelte); the look is TaskDetailBar's
	row.

	`ask` is the question line, defaulting to `${label}?`; a caller that wants
	"Delete this task?" passes `ask="Delete this task?"`. While the ask is open
	focus sits on Cancel, and closing it (either way) puts focus back on the
	trigger.

	Doc: src/lib/kernel/README.md
-->
<script lang="ts">
	interface Props {
		label: string;
		ask?: string;
		confirmLabel?: string;
		cancelLabel?: string;
		onconfirm: () => void;
		disabled?: boolean;
		testid?: string;
	}

	let {
		label,
		ask,
		confirmLabel = 'Yes, delete',
		cancelLabel = 'Cancel',
		onconfirm,
		disabled = false,
		testid
	}: Props = $props();

	const question = $derived(ask ?? `${label}?`);

	let confirming = $state(false);
	let triggerEl = $state<HTMLButtonElement>();
	let cancelEl = $state<HTMLButtonElement>();
	// Only move focus back once the ask has actually been open, so mounting the
	// control never steals focus from the page.
	let asked = false;

	$effect(() => {
		if (confirming) {
			asked = true;
			cancelEl?.focus();
		} else if (asked) {
			asked = false;
			triggerEl?.focus();
		}
	});
</script>

{#if confirming}
	<div class="flex flex-wrap items-center gap-2">
		<span class="text-sm font-medium text-red-600">{question}</span>
		<button
			type="button"
			onclick={() => {
				// Close the ask before running it, so a double click cannot fire twice.
				confirming = false;
				onconfirm();
			}}
			{disabled}
			class="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
			data-testid={testid && `${testid}-confirm`}
		>
			{confirmLabel}
		</button>
		<button
			type="button"
			bind:this={cancelEl}
			onclick={() => (confirming = false)}
			{disabled}
			class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
			data-testid={testid && `${testid}-cancel`}
		>
			{cancelLabel}
		</button>
	</div>
{:else}
	<button
		type="button"
		bind:this={triggerEl}
		onclick={() => (confirming = true)}
		{disabled}
		class="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
		data-testid={testid}
	>
		{label}
	</button>
{/if}
