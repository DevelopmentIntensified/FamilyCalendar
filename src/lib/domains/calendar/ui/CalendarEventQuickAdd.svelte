<!--
	Quick Add: one sentence, parsed 300 ms after typing stops. It re-fills the
	form's fields (never the ones the user touched), says so while parsing, and
	offers "Create N events" when the phrase matched several dates — one POST per
	event, every result reported. A parser failure only says to fill the fields
	by hand; it never blocks the form.

	Doc: ../../README.md#public-interface
-->
<script lang="ts">
	import type { CalendarEventFormState } from '../calendar.eventForm.state.svelte';

	interface Props {
		state: CalendarEventFormState;
		oncreateall: () => void;
		onreportphrase?: () => void;
	}

	let { state, oncreateall, onreportphrase }: Props = $props();

	/** Latched for the template: a narrowing on `state.multiResults` does not
	 * survive into a nested expression. */
	const multi = $derived(state.multiResults);
	const parsedDates = $derived(state.lastParse?.dates ?? []);
</script>

<div>
	<label for="nl-input" class="mb-1 block text-sm font-medium text-slate-700">Quick Add</label>
	<div class="mt-1 flex gap-2">
		<div class="relative flex-1">
			<input
				id="nl-input"
				type="text"
				value={state.quickAdd}
				oninput={(event) => state.onQuickAddInput(event.currentTarget.value)}
				placeholder="Lunch Friday at noon with John"
				class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm transition-all focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
			/>
			{#if state.parsing}
				<div class="absolute right-3 top-1/2 -translate-y-1/2">
					<div
						class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-600 border-t-transparent"
					></div>
				</div>
			{/if}
		</div>
		<button
			type="button"
			onclick={() => state.reset()}
			class="rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-50"
		>
			Clear
		</button>
	</div>
	{#if parsedDates.length > 1}
		<div class="mt-1 text-right text-xs font-medium text-primary-600">
			Creates {parsedDates.length} events — one per date
		</div>
	{/if}
	{#if state.parseError}
		<p class="mt-1 text-xs text-amber-600" role="status">
			Couldn't check that with the parser just now — fill the fields below manually.
		</p>
	{/if}
	{#if multi && multi.length > 1}
		<div class="mt-2 rounded-lg border border-primary-200 bg-primary-50 p-3">
			<div class="mb-1 text-xs font-semibold text-primary-700">
				{multi.length} events detected
			</div>
			<ul class="mb-2 space-y-0.5">
				{#each multi as result (result.parsed.date ?? result.parsed.title ?? '')}
					<li class="text-xs text-slate-600">
						{result.parsed.title || 'Untitled'} — {result.parsed.date || ''}{result.parsed.startTime
							? ` at ${result.parsed.startTime}`
							: ''}
					</li>
				{/each}
			</ul>
			<div class="flex gap-2">
				<button
					type="button"
					onclick={oncreateall}
					disabled={state.saving}
					class="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-primary-700 disabled:opacity-50"
				>
					Create {multi.length} events
				</button>
				<button
					type="button"
					onclick={() => (state.multiResults = null)}
					class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
				>
					Just the first
				</button>
			</div>
		</div>
	{/if}
	{#if state.phraseReportable && state.quickAdd.trim() && onreportphrase}
		<div class="mt-1 text-right">
			{#if state.phraseReported}
				<span class="text-xs text-slate-400">Thanks — we'll teach the parser.</span>
			{:else}
				<button
					type="button"
					onclick={onreportphrase}
					disabled={state.reportingPhrase}
					class="text-xs text-slate-400 underline hover:text-slate-600 disabled:opacity-50"
				>
					{state.reportingPhrase ? 'Reporting…' : 'Parsed wrong? Report this phrase'}
				</button>
			{/if}
		</div>
	{/if}
</div>
