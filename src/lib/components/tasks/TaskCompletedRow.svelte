<script lang="ts">
	interface Props {
		task: {
			id: string;
			title: string;
			dueDate: string | null;
			recurrenceFrequency?: string | null;
			eventTitle?: string | null;
			tags?: string[];
		};
		busy: boolean;
		confirmDelete: boolean;
		onToggle: () => void;
		onDelete: () => void;
		onAskDelete: () => void;
		onCancelDelete: () => void;
	}

	let { task, busy, confirmDelete, onToggle, onDelete, onAskDelete, onCancelDelete }: Props =
		$props();

	const FREQ_NOUN = {
		daily: 'day',
		weekly: 'week',
		monthly: 'month',
		yearly: 'year'
	} satisfies Record<string, string>;

	function freqNoun(frequency: string | null | undefined): string | undefined {
		if (
			frequency === 'daily' ||
			frequency === 'weekly' ||
			frequency === 'monthly' ||
			frequency === 'yearly'
		)
			return FREQ_NOUN[frequency];
		return undefined;
	}

	function formatDue(due: string | null): string {
		if (!due) return '';
		const dt = new Date(due);
		if (isNaN(dt.getTime())) return '';
		const opts: Intl.DateTimeFormatOptions =
			dt.getFullYear() !== new Date().getFullYear()
				? { month: 'short', day: 'numeric', year: 'numeric' }
				: { month: 'short', day: 'numeric' };
		return dt.toLocaleDateString(undefined, opts);
	}
</script>

<div
	class="group flex min-w-0 flex-wrap items-center gap-2.5 overflow-hidden rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-2 transition-colors hover:bg-slate-100"
>
	<button
		type="button"
		onclick={onToggle}
		disabled={busy}
		class="relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-500 text-white active:bg-primary-600"
		aria-label="Mark incomplete"
	>
		<span class="absolute -inset-2" aria-hidden="true"></span>
		<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
			<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
		</svg>
	</button>
	<p class="min-w-0 flex-1 truncate text-sm text-slate-400 line-through">
		{task.title}
		{#if task.eventTitle}<span class="ml-1 text-xs font-normal text-slate-400 no-underline"
				>({task.eventTitle})</span
			>{/if}
	</p>
	{#if task.dueDate}
		<span
			class="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-400"
		>
			{formatDue(task.dueDate)}
		</span>
	{/if}
	{#if task.recurrenceFrequency}
		<span
			class="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-400"
			title="Repeats every {freqNoun(task.recurrenceFrequency) ?? task.recurrenceFrequency}"
		>
			every {freqNoun(task.recurrenceFrequency) ?? task.recurrenceFrequency}
		</span>
	{/if}
	{#if (task.tags ?? []).length > 0}
		<div class="flex flex-wrap gap-1">
			{#each task.tags ?? [] as tag (tag)}
				<span
					class="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-500"
					>#{tag}</span
				>
			{/each}
		</div>
	{/if}
	{#if confirmDelete}
		<div class="flex shrink-0 items-center gap-1.5">
			<span class="text-xs font-medium text-red-600">Delete?</span>
			<button
				type="button"
				onclick={onDelete}
				disabled={busy}
				class="rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
			>
				{busy ? 'Deleting…' : 'Yes'}
			</button>
			<button
				type="button"
				onclick={onCancelDelete}
				disabled={busy}
				class="rounded-full bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-300"
			>
				No
			</button>
		</div>
	{:else}
		<button
			type="button"
			onclick={onAskDelete}
			disabled={busy}
			class="pointer-fine:opacity-40 pointer-fine:group-hover:opacity-100 relative shrink-0 rounded-full p-2 text-slate-300 transition-all hover:bg-red-50 hover:text-red-500 focus-visible:opacity-100 active:bg-red-50"
			aria-label="Delete task"
		>
			<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
				/>
			</svg>
		</button>
	{/if}
</div>
