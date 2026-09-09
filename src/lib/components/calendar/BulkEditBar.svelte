<script lang="ts">
	interface PlanItem {
		id: string;
		label: string;
	}

	/** Bulk op payload — mirrors the server's BulkOp union. */
	type BulkOp =
		| { type: 'delete' }
		| { type: 'calendar'; calendarId: string }
		| { type: 'location'; location: string }
		| { type: 'attendants'; add: string[] }
		| { type: 'smart'; instruction: string };

	interface Props {
		selectedIds: string[];
		bulkBusy: boolean;
		bulkConfirmDelete: boolean;
		smartPlan: { ops: unknown[]; items: PlanItem[] } | null;
		pastWarning: boolean;
		bulkLocation: string;
		bulkAttendants: string;
		bulkInstruction: string;
		moreToolsOpen: boolean;
		bulkError: string;
		phraseReported: boolean;
		reportingPhrase: boolean;
		calendarIds: { id: string; name: string }[];
		onRunBulk: (op: BulkOp) => void;
		onRunSmart: (force?: boolean) => void;
		onApplyBulkCalendar: (e: Event) => void;
		onSetSelectionMode: (on: boolean) => void;
		onAskDelete: () => void;
		onDiscardPlan: () => void;
		onCancelDelete: () => void;
		onDismissPastWarning: () => void;
		onToggleMoreTools: () => void;
		onReportPhrase: () => void;
	}

	let {
		selectedIds,
		bulkBusy,
		bulkConfirmDelete,
		smartPlan,
		pastWarning,
		bulkLocation = $bindable(),
		bulkAttendants = $bindable(),
		bulkInstruction = $bindable(),
		moreToolsOpen,
		bulkError,
		phraseReported,
		reportingPhrase,
		calendarIds,
		onRunBulk,
		onRunSmart,
		onApplyBulkCalendar,
		onSetSelectionMode,
		onAskDelete,
		onDiscardPlan,
		onCancelDelete,
		onDismissPastWarning,
		onToggleMoreTools,
		onReportPhrase
	}: Props = $props();
</script>

<div
	class="fixed bottom-14 left-1/2 z-40 w-[calc(100%-1.5rem)] max-w-3xl -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-3 shadow-xl"
	role="toolbar"
	aria-label="Bulk edit selected events"
>
	{#if bulkConfirmDelete}
		<div class="mb-2 rounded-lg border border-red-200 bg-red-50 p-2.5">
			<div class="flex flex-wrap items-center gap-2">
				<span class="text-xs font-medium text-red-700">
					Delete {selectedIds.length} event{selectedIds.length === 1 ? '' : 's'}? Attached
					checklists go too.
				</span>
				<button
					type="button"
					onclick={() => onRunBulk({ type: 'delete' })}
					disabled={bulkBusy}
					class="rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
				>
					{bulkBusy ? 'Deleting…' : 'Yes, delete'}
				</button>
				<button
					type="button"
					onclick={onCancelDelete}
					disabled={bulkBusy}
					class="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
				>
					Cancel
				</button>
			</div>
		</div>
	{/if}

	{#if smartPlan}
		<div class="mb-2 rounded-lg border border-purple-200 bg-purple-50/70 p-2.5">
			<p class="mb-1 text-[10px] font-bold uppercase tracking-wide text-purple-700">
				Planned changes — review, then apply
			</p>
			<ul class="max-h-28 space-y-0.5 overflow-y-auto text-xs text-slate-700">
				{#each smartPlan.items as p (p.id)}
					<li class="truncate">• {p.label}</li>
				{/each}
			</ul>
			{#if pastWarning}
				<div class="mt-2 flex flex-wrap items-center gap-2 border-t border-purple-200 pt-2">
					<span class="text-xs font-medium text-red-700">
						Some of these changes move events to past dates.
					</span>
					<button
						type="button"
						onclick={() => onRunSmart(true)}
						disabled={bulkBusy}
						class="rounded-lg bg-purple-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
					>
						Apply anyway
					</button>
					<button
						type="button"
						onclick={onDismissPastWarning}
						disabled={bulkBusy}
						class="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
					>
						Go back
					</button>
				</div>
			{/if}
		</div>
	{/if}

	<div class="flex flex-wrap items-center gap-2">
		<span class="rounded-full bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-700">
			{selectedIds.length} selected
		</span>

		<div class="flex flex-wrap items-center gap-2 {moreToolsOpen ? '' : 'hidden'} sm:contents">
			<select
				onchange={onApplyBulkCalendar}
				disabled={bulkBusy || selectedIds.length === 0}
				aria-label="Move to calendar"
				class="rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs font-medium text-slate-700 disabled:opacity-50 sm:py-1.5"
			>
				<option value="">Calendar…</option>
				{#each calendarIds as c (c.id)}
					<option value={c.id}>{c.name}</option>
				{/each}
			</select>

			<div class="flex items-center gap-1">
				<input
					type="text"
					bind:value={bulkLocation}
					placeholder="Location…"
					aria-label="Set location"
					class="w-28 rounded-lg border border-slate-300 px-2 py-2 text-xs disabled:opacity-50 sm:py-1.5"
					disabled={bulkBusy || selectedIds.length === 0}
					onkeydown={(e) =>
						e.key === 'Enter' && onRunBulk({ type: 'location', location: bulkLocation })}
				/>
				<button
					type="button"
					onclick={() => onRunBulk({ type: 'location', location: bulkLocation })}
					disabled={bulkBusy || selectedIds.length === 0 || !bulkLocation.trim()}
					class="rounded-lg border border-slate-300 px-2 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 sm:py-1.5"
				>
					Set
				</button>
			</div>

			<div class="flex items-center gap-1">
				<input
					type="text"
					bind:value={bulkAttendants}
					placeholder="+ Attendant…"
					aria-label="Add attendant"
					class="w-28 rounded-lg border border-slate-300 px-2 py-2 text-xs disabled:opacity-50 sm:py-1.5"
					disabled={bulkBusy || selectedIds.length === 0}
					onkeydown={(e) =>
						e.key === 'Enter' && onRunBulk({ type: 'attendants', add: [bulkAttendants] })}
				/>
				<button
					type="button"
					onclick={() =>
						onRunBulk({
							type: 'attendants',
							add: bulkAttendants
								.split(',')
								.map((s) => s.trim())
								.filter(Boolean)
						})}
					disabled={bulkBusy || selectedIds.length === 0 || !bulkAttendants.trim()}
					class="rounded-lg border border-slate-300 px-2 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 sm:py-1.5"
				>
					Add
				</button>
			</div>
		</div>

		<div class="ml-auto flex items-center gap-2">
			{#if smartPlan}
				<button
					type="button"
					onclick={onDiscardPlan}
					disabled={bulkBusy}
					class="rounded-lg border border-slate-300 px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 sm:py-1.5"
				>
					Discard
				</button>
				<button
					type="button"
					onclick={() => onRunSmart()}
					disabled={bulkBusy}
					class="rounded-lg bg-purple-600 px-3 py-2 text-xs font-semibold text-white hover:bg-purple-700 disabled:opacity-50 sm:py-1.5"
				>
					{bulkBusy
						? 'Applying…'
						: `Apply ${smartPlan.items.length} change${smartPlan.items.length === 1 ? '' : 's'}`}
				</button>
			{:else}
				<div class="flex items-center gap-1 {moreToolsOpen ? '' : 'hidden'} sm:contents">
					<input
						type="text"
						bind:value={bulkInstruction}
						placeholder="e.g. 'move all to next friday'"
						aria-label="Smart instruction"
						class="w-44 rounded-lg border border-purple-200 bg-purple-50/40 px-2 py-2 text-xs placeholder:text-purple-300 disabled:opacity-50 sm:py-1.5"
						disabled={bulkBusy || selectedIds.length === 0}
						onkeydown={(e) => e.key === 'Enter' && onRunSmart()}
					/>
					<button
						type="button"
						onclick={() => onRunSmart()}
						disabled={bulkBusy || selectedIds.length === 0 || !bulkInstruction.trim()}
						title="Rename, reschedule, relocate, move calendars or delete — previewed before anything applies"
						class="rounded-lg bg-purple-600 px-2.5 py-2 text-xs font-semibold text-white hover:bg-purple-700 disabled:opacity-50 sm:py-1.5"
					>
						✨ Smart…
					</button>
				</div>

				<button
					type="button"
					onclick={onAskDelete}
					disabled={bulkBusy || selectedIds.length === 0}
					class="rounded-lg border border-red-200 px-2.5 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 sm:py-1.5"
				>
					Delete
				</button>
			{/if}

			<button
				type="button"
				onclick={() => onSetSelectionMode(false)}
				class="rounded-lg px-2 py-2 text-xs font-medium text-slate-500 hover:text-slate-800 sm:py-1.5"
			>
				Done
			</button>
		</div>

		<button
			type="button"
			onclick={onToggleMoreTools}
			aria-expanded={moreToolsOpen}
			class="rounded-lg border border-slate-300 px-2 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 sm:hidden"
		>
			{moreToolsOpen ? 'Less tools' : 'More tools'}
		</button>
	</div>
	{#if bulkError}
		<div class="mt-2 flex items-center gap-2">
			<p class="text-xs font-medium text-red-600" role="alert">{bulkError}</p>
			{#if bulkInstruction.trim()}
				{#if phraseReported}
					<span class="text-xs text-slate-400">Thanks — reported.</span>
				{:else}
					<button
						type="button"
						onclick={onReportPhrase}
						disabled={reportingPhrase}
						class="text-xs text-slate-400 underline hover:text-slate-600 disabled:opacity-50"
					>
						{reportingPhrase ? 'Reporting…' : 'Report this'}
					</button>
				{/if}
			{/if}
		</div>
	{/if}
</div>
