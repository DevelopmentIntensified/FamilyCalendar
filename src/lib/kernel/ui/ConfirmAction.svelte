<!--
	Two-step destructive action: the first click only asks (`Delete?` plus the
	confirm and cancel buttons), so one stray tap can never delete anything.
	Folds five hand-written copies (TaskRow, TaskCompletedRow, FamilyOpenTaskRow,
	TaskDetailBar, and the family member-remove row in
	routes/(family)/family/[familyId]/+page.svelte).

	`ask` is the question line, defaulting to `${label}?`; a caller that wants
	"Delete this task?" passes `ask="Delete this task?"`. The ask sits in a
	`role="group"` named by that question, so landing on Cancel announces it.
	While the ask is open focus sits on Cancel, and closing it (either way) puts
	focus back on the trigger.

	Three looks, one behaviour: the default toolbar row (TaskDetailBar), `icon`
	for a row's trash trigger with the compact "Yes"/"No" pair (TaskRow,
	TaskCompletedRow, FamilyOpenTaskRow), and `form`, where confirming POSTs
	`formAction` with `formFields` and `h-11` buttons (the family page's member
	row). `onconfirm` may return a promise: the ask stays open, both buttons are
	disabled and the confirm button reads `pendingLabel` until it settles.
	Esc closes the ask and stops there, so a sheet around it stays open.

	Doc: src/lib/kernel/README.md
-->
<script lang="ts">
	type Variant = 'default' | 'icon' | 'form';

	interface Props {
		/** The trigger's text — and, on the icon variant, its accessible name. */
		label: string;
		/** The question line, defaulting to `${label}?`. */
		ask?: string;
		confirmLabel?: string;
		cancelLabel?: string;
		/** What confirming does. Return a promise to keep the ask open while it runs. */
		onconfirm?: () => void | Promise<void>;
		/** Toolbar row (default), row trash trigger (`icon`), or form POST (`form`). */
		variant?: Variant;
		/** Where the `form` variant submits. */
		formAction?: string;
		/** Hidden inputs the `form` variant submits. */
		formFields?: Record<string, string>;
		/** Confirm-button copy while the action runs ("Deleting…"); falls back to `confirmLabel`. */
		pendingLabel?: string;
		disabled?: boolean;
		/** Base test id; the buttons are `${testid}`, `-confirm` and `-cancel`. */
		testid?: string;
	}

	let {
		label,
		ask,
		confirmLabel = 'Yes, delete',
		cancelLabel = 'Cancel',
		onconfirm,
		variant = 'default',
		formAction,
		formFields = {},
		pendingLabel = undefined,
		disabled = false,
		testid = 'confirm-action'
	}: Props = $props();

	const question = $derived(ask ?? `${label}?`);

	let confirming = $state(false);
	/** A promise returned by `onconfirm` is still in flight. */
	let pending = $state(false);
	const busy = $derived(disabled || pending);
	const confirmText = $derived(busy && pendingLabel ? pendingLabel : confirmLabel);

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

	const ASK_ROW: Record<Variant, string> = {
		default: 'flex flex-wrap items-center gap-2',
		icon: 'flex shrink-0 items-center gap-1.5',
		form: 'flex items-center gap-1.5'
	};
	const ASK_LINE: Record<Variant, string> = {
		default: 'text-sm font-medium text-red-600',
		icon: 'text-xs font-medium text-red-600',
		form: 'text-sm text-red-600'
	};
	const CONFIRM_BUTTON: Record<Variant, string> = {
		default:
			'rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50',
		icon: 'rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50',
		form: 'h-11 rounded-lg bg-red-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50'
	};
	const CANCEL_BUTTON: Record<Variant, string> = {
		default:
			'rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50',
		icon: 'rounded-full bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-300',
		form: 'h-11 rounded-lg bg-slate-200 px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-300'
	};
	const TRIGGER: Record<Variant, string> = {
		default:
			'rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50',
		icon: 'pointer-fine:opacity-40 pointer-fine:group-hover:opacity-100 relative shrink-0 rounded-full p-2 text-slate-300 transition-all hover:bg-red-50 hover:text-red-500 focus-visible:opacity-100 active:bg-red-50',
		form: 'h-11 rounded-lg border border-red-300 bg-white px-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-50'
	};

	async function confirm() {
		if (busy) return;
		// `unknown`: the callback's return is either nothing or a promise.
		const result: unknown = onconfirm?.();
		if (!(result instanceof Promise)) {
			confirming = false;
			return;
		}
		pending = true;
		try {
			await result;
		} catch {
			// The caller reports its own failure; the ask still closes so it can be retried.
		} finally {
			pending = false;
			confirming = false;
		}
	}

	function cancel() {
		if (busy) return;
		confirming = false;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (!confirming || event.key !== 'Escape') return;
		// The ask owns Esc: a sheet holding it must not close as well.
		event.preventDefault();
		if (!busy) confirming = false;
	}
</script>

{#if confirming}
	<!--
		svelte-ignore a11y_no_noninteractive_element_interactions
		The ask is one composite control (APG: a group owns the keys of its
		buttons): Esc is handled here so it never reaches a sheet around it.
	-->
	<div role="group" aria-label={question} class={ASK_ROW[variant]} onkeydown={handleKeydown}>
		<span class={ASK_LINE[variant]}>{question}</span>
		{#if variant === 'form'}
			<form method="POST" action={formAction}>
				{#each Object.entries(formFields) as [name, value] (name)}
					<input type="hidden" {name} {value} />
				{/each}
				<button
					type="submit"
					disabled={busy}
					class={CONFIRM_BUTTON.form}
					data-testid="{testid}-confirm"
				>
					{confirmText}
				</button>
			</form>
		{:else}
			<button
				type="button"
				onclick={confirm}
				disabled={busy}
				class={CONFIRM_BUTTON[variant]}
				data-testid="{testid}-confirm"
			>
				{confirmText}
			</button>
		{/if}
		<button
			type="button"
			bind:this={cancelEl}
			onclick={cancel}
			disabled={busy}
			class={CANCEL_BUTTON[variant]}
			data-testid="{testid}-cancel"
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
		class={TRIGGER[variant]}
		aria-label={variant === 'icon' ? label : undefined}
		data-testid={testid}
	>
		{#if variant === 'icon'}
			<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
				/>
			</svg>
		{:else}
			{label}
		{/if}
	</button>
{/if}
