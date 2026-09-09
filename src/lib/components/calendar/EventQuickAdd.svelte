<script lang="ts">
	import type { NlpFormInput } from './EventFormModel.svelte';

	interface Props {
		nlInput: string;
		parsing: boolean;
		parseError: boolean;
		multiResults: Array<{ parsed: NlpFormInput; confidence: number }> | null;
		submitting: boolean;
		lastParseResult: { dates?: string[] } | null;
		phraseReportable: boolean;
		phraseReported: boolean;
		reportingPhrase: boolean;
		onNlInputChange: () => void;
		onClear: () => void;
		onCreateAll: () => void;
		onDismissMulti: () => void;
		onReportPhrase: () => void;
	}

	let {
		nlInput = $bindable(),
		parsing,
		parseError,
		multiResults = $bindable(),
		submitting,
		lastParseResult,
		phraseReportable,
		phraseReported,
		reportingPhrase,
		onNlInputChange,
		onClear,
		onCreateAll,
		onDismissMulti,
		onReportPhrase
	}: Props = $props();
</script>

<div>
	<label for="nl-input" class="mb-1 block text-sm font-medium text-slate-700">Quick Add</label>
	<div class="mt-1 flex gap-2">
		<div class="relative flex-1">
			<input
				id="nl-input"
				type="text"
				bind:value={nlInput}
				on:input={onNlInputChange}
				placeholder="Lunch Friday at noon with John"
				class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm transition-all focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
			/>
			{#if parsing}
				<div class="absolute right-3 top-1/2 -translate-y-1/2">
					<div
						class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-600 border-t-transparent"
					></div>
				</div>
			{/if}
		</div>
		<button
			type="button"
			on:click={onClear}
			class="rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-50"
		>
			Clear
		</button>
	</div>
	{#if lastParseResult?.dates && lastParseResult.dates.length > 1}
		<div class="mt-1 text-right text-xs font-medium text-primary-600">
			Creates {lastParseResult.dates.length} events — one per date
		</div>
	{/if}
	{#if parseError}
		<p class="mt-1 text-xs text-amber-600" role="status">
			Couldn't check that with the parser just now — fill the fields below manually.
		</p>
	{/if}
	{#if multiResults && multiResults.length > 1}
		<div class="mt-2 rounded-lg border border-primary-200 bg-primary-50 p-3">
			<div class="mb-1 text-xs font-semibold text-primary-700">
				{multiResults.length} events detected
			</div>
			<ul class="mb-2 space-y-0.5">
				{#each multiResults as r}
					<li class="text-xs text-slate-600">
						{String(r.parsed.title || 'Untitled')} — {String(r.parsed.date || '')}{r.parsed
							.startTime
							? ` at ${r.parsed.startTime}`
							: ''}
					</li>
				{/each}
			</ul>
			<div class="flex gap-2">
				<button
					type="button"
					on:click={onCreateAll}
					disabled={submitting}
					class="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-primary-700 disabled:opacity-50"
				>
					Create {multiResults.length} events
				</button>
				<button
					type="button"
					on:click={onDismissMulti}
					class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
				>
					Just the first
				</button>
			</div>
		</div>
	{/if}
	{#if phraseReportable && nlInput.trim()}
		<div class="mt-1 text-right">
			{#if phraseReported}
				<span class="text-xs text-slate-400">Thanks — we'll teach the parser.</span>
			{:else}
				<button
					type="button"
					on:click={onReportPhrase}
					disabled={reportingPhrase}
					class="text-xs text-slate-400 underline hover:text-slate-600 disabled:opacity-50"
				>
					{reportingPhrase ? 'Reporting…' : 'Parsed wrong? Report this phrase'}
				</button>
			{/if}
		</div>
	{/if}
</div>
