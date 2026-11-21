<!--
	The bulk edit bar (legacy `BulkEditBar`), shown in Selection mode where the
	Quick Add FAB would be. It owns no state of its own: selection lives in the
	page state and the operations in `CalendarBulkState` (dry run → review →
	apply, inline delete confirm, past-date ask, verbatim server error).
-->
<script lang="ts">
	import type { CalendarPageState } from '../calendarPage.state.svelte';

	interface Props {
		state: CalendarPageState;
	}

	let { state }: Props = $props();

	const bulk = $derived(state.bulk);
	const ids = $derived(state.selectedIds);

	function runLocation() {
		if (bulk.busy || ids.length === 0 || !bulk.location.trim()) return;
		void bulk.runBulk(ids, { type: 'location', location: bulk.location });
	}

	/** "Ann, Bob" is two attendants, never one guest named "Ann, Bob" (#226). */
	function runAttendants() {
		if (bulk.busy || ids.length === 0) return;
		const add = bulk.attendants
			.split(',')
			.map((entry) => entry.trim())
			.filter(Boolean);
		if (add.length === 0) return;
		void bulk.runBulk(ids, { type: 'attendants', add });
	}
</script>

<div
	class="fixed bottom-14 left-1/2 z-40 w-[calc(100%-1.5rem)] max-w-3xl -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-3 shadow-xl"
	role="toolbar"
	aria-label="Bulk edit selected events"
>
	{#if bulk.confirmDelete}
		<div class="mb-2 rounded-lg border border-red-200 bg-red-50 p-2.5">
			<div class="flex flex-wrap items-center gap-2">
				<span class="text-xs font-medium text-red-700">
					Delete {ids.length} event{ids.length === 1 ? '' : 's'}? Attached checklists go too.
				</span>
				<button
					type="button"
					onclick={() => void bulk.runBulk(ids, { type: 'delete' })}
					disabled={bulk.busy}
					class="rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
				>
					{bulk.busy ? 'Deleting…' : 'Yes, delete'}
				</button>
				<button
					type="button"
					onclick={() => (bulk.confirmDelete = false)}
					disabled={bulk.busy}
					class="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
				>
					Cancel
				</button>
			</div>
		</div>
	{/if}

	{#if bulk.plan}
		<div class="mb-2 rounded-lg border border-purple-200 bg-purple-50/70 p-2.5">
			<p class="mb-1 text-[10px] font-bold uppercase tracking-wide text-purple-700">
				Planned changes — review, then apply
			</p>
			<ul class="max-h-28 space-y-0.5 overflow-y-auto text-xs text-slate-700">
				{#each bulk.plan.items as item (item.id)}
					<li class="truncate">• {item.label}</li>
				{/each}
			</ul>
			{#if bulk.pastWarning}
				<div class="mt-2 flex flex-wrap items-center gap-2 border-t border-purple-200 pt-2">
					<span class="text-xs font-medium text-red-700">
						Some of these changes move events to past dates.
					</span>
					<button
						type="button"
						onclick={() => void bulk.runSmart(ids, true)}
						disabled={bulk.busy}
						class="rounded-lg bg-purple-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
					>
						Apply anyway
					</button>
					<button
						type="button"
						onclick={() => (bulk.pastWarning = false)}
						disabled={bulk.busy}
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
			{ids.length} selected
		</span>

		<div class="flex flex-wrap items-center gap-2 {bulk.moreTools ? '' : 'hidden'} sm:contents">
			<select
				onchange={(event) => {
					const select = event.currentTarget;
					const calendarId = select.value;
					select.value = '';
					if (calendarId) void bulk.runBulk(ids, { type: 'calendar', calendarId });
				}}
				disabled={bulk.busy || ids.length === 0}
				aria-label="Move to calendar"
				class="rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs font-medium text-slate-700 disabled:opacity-50 sm:py-1.5"
			>
				<option value="">Calendar…</option>
				{#each state.shell.calendars as calendar (calendar.id)}
					<option value={calendar.id}>{calendar.name}</option>
				{/each}
			</select>

			<div class="flex items-center gap-1">
				<input
					type="text"
					value={bulk.location}
					oninput={(event) => (bulk.location = event.currentTarget.value)}
					placeholder="Location…"
					aria-label="Set location"
					class="w-28 rounded-lg border border-slate-300 px-2 py-2 text-xs disabled:opacity-50 sm:py-1.5"
					disabled={bulk.busy || ids.length === 0}
					onkeydown={(event) => event.key === 'Enter' && runLocation()}
				/>
				<button
					type="button"
					onclick={runLocation}
					disabled={bulk.busy || ids.length === 0 || !bulk.location.trim()}
					class="rounded-lg border border-slate-300 px-2 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 sm:py-1.5"
				>
					Set
				</button>
			</div>

			<div class="flex items-center gap-1">
				<input
					type="text"
					value={bulk.attendants}
					oninput={(event) => (bulk.attendants = event.currentTarget.value)}
					placeholder="+ Attendant…"
					aria-label="Add attendant"
					class="w-28 rounded-lg border border-slate-300 px-2 py-2 text-xs disabled:opacity-50 sm:py-1.5"
					disabled={bulk.busy || ids.length === 0}
					onkeydown={(event) => event.key === 'Enter' && runAttendants()}
				/>
				<button
					type="button"
					onclick={runAttendants}
					disabled={bulk.busy || ids.length === 0 || !bulk.attendants.trim()}
					class="rounded-lg border border-slate-300 px-2 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 sm:py-1.5"
				>
					Add
				</button>
			</div>
		</div>

		<div class="ml-auto flex items-center gap-2">
			{#if bulk.plan}
				<button
					type="button"
					onclick={() => (bulk.plan = null)}
					disabled={bulk.busy}
					class="rounded-lg border border-slate-300 px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 sm:py-1.5"
				>
					Discard
				</button>
				<button
					type="button"
					onclick={() => void bulk.runSmart(ids)}
					disabled={bulk.busy}
					class="rounded-lg bg-purple-600 px-3 py-2 text-xs font-semibold text-white hover:bg-purple-700 disabled:opacity-50 sm:py-1.5"
				>
					{bulk.busy
						? 'Applying…'
						: `Apply ${bulk.plan.items.length} change${bulk.plan.items.length === 1 ? '' : 's'}`}
				</button>
			{:else}
				<div class="flex items-center gap-1 {bulk.moreTools ? '' : 'hidden'} sm:contents">
					<input
						type="text"
						value={bulk.instruction}
						oninput={(event) => (bulk.instruction = event.currentTarget.value)}
						placeholder="e.g. 'move all to next friday'"
						aria-label="Smart instruction"
						class="w-44 rounded-lg border border-purple-200 bg-purple-50/40 px-2 py-2 text-xs placeholder:text-purple-300 disabled:opacity-50 sm:py-1.5"
						disabled={bulk.busy || ids.length === 0}
						onkeydown={(event) => event.key === 'Enter' && void bulk.runSmart(ids)}
					/>
					<button
						type="button"
						onclick={() => void bulk.runSmart(ids)}
						disabled={bulk.busy || ids.length === 0 || !bulk.instruction.trim()}
						title="Rename, reschedule, relocate, move calendars or delete — previewed before anything applies"
						class="rounded-lg bg-purple-600 px-2.5 py-2 text-xs font-semibold text-white hover:bg-purple-700 disabled:opacity-50 sm:py-1.5"
					>
						✨ Smart…
					</button>
				</div>

				<button
					type="button"
					onclick={() => (bulk.confirmDelete = true)}
					disabled={bulk.busy || ids.length === 0}
					class="rounded-lg border border-red-200 px-2.5 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 sm:py-1.5"
				>
					Delete
				</button>
			{/if}

			<button
				type="button"
				onclick={() => state.setSelectionMode(false)}
				class="rounded-lg px-2 py-2 text-xs font-medium text-slate-500 hover:text-slate-800 sm:py-1.5"
			>
				Done
			</button>
		</div>

		<button
			type="button"
			onclick={() => (bulk.moreTools = !bulk.moreTools)}
			aria-expanded={bulk.moreTools}
			class="rounded-lg border border-slate-300 px-2 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 sm:hidden"
		>
			{bulk.moreTools ? 'Less tools' : 'More tools'}
		</button>
	</div>

	{#if bulk.error}
		<div class="mt-2 flex items-center gap-2">
			<p class="text-xs font-medium text-red-600" role="alert">{bulk.error}</p>
			{#if bulk.instruction.trim()}
				{#if bulk.reported}
					<span class="text-xs text-slate-400">Thanks — reported.</span>
				{:else}
					<button
						type="button"
						onclick={() => void bulk.reportPhrase(ids)}
						disabled={bulk.reporting}
						class="text-xs text-slate-400 underline hover:text-slate-600 disabled:opacity-50"
					>
						{bulk.reporting ? 'Reporting…' : 'Report this'}
					</button>
				{/if}
			{/if}
		</div>
	{/if}
</div>
