<!--
	The recurrence card: the rule the grid repeats, how far it has got, and the
	two scopes a change can be made at (issue 126's `event.html`). The scope
	buttons only appear when the caller can scope — a series opened whole offers
	only "All occurrences", with the reason spelled out.

	Doc: ../../README.md#public-interface
-->
<script lang="ts">
	import { DateTime } from 'luxon';
	import { calendarSeriesFacts, type CalendarEventView } from '../calendar.eventView.rules';

	interface Props {
		event: CalendarEventView;
		/** Which scope the delete confirm is armed at. */
		deleteScope?: 'this' | 'all';
		/** The scopes a change can be made at (a whole series offers `all`). */
		scopes?: ('this' | 'all')[];
		/** Change scope; absent draws the card without the buttons. */
		onscope?: (scope: 'this' | 'all') => void;
		/** The viewer's clock, passed in (R5: no ambient time in v2). */
		now: DateTime;
	}

	let {
		event,
		deleteScope = 'all',
		scopes = ['this', 'all'],
		onscope,
		now
	}: Props = $props();

	const series = $derived(calendarSeriesFacts(event, now));

	const SCOPE_LABEL: Record<'this' | 'all', string> = {
		this: 'This occurrence',
		all: 'All occurrences'
	};
</script>

{#if series}
	<div class="border-t border-slate-100 px-4 py-4 sm:px-6" data-testid="recurrence-card">
		<h3 class="mb-2 text-sm font-semibold text-slate-700">This is a repeating event</h3>
		<span class="min-w-0 flex-1">
			<span class="block text-sm font-semibold text-slate-800">{series.rule}</span>
			<span class="block text-xs text-slate-400" data-testid="series-count">{series.since}</span>
		</span>
		{#if onscope}
			<div class="mt-3 flex flex-wrap gap-2">
				{#each scopes as scope (scope)}
					<button
						type="button"
						onclick={() => onscope?.(scope)}
						aria-pressed={deleteScope === scope}
						class="rounded-lg border px-3 py-2 text-sm font-medium transition-colors {deleteScope ===
						scope
							? 'border-primary-300 bg-primary-50 text-primary-700'
							: 'border-slate-300 text-slate-700 hover:bg-slate-50'}"
					>
						{SCOPE_LABEL[scope]}
					</button>
				{/each}
			</div>
			{#if !scopes.includes('this')}
				<p class="mt-2 text-xs text-slate-400">
					Open one occurrence to change just that week — the whole series is what a change here applies
					to.
				</p>
			{/if}
		{/if}
		<p class="mt-3 text-xs leading-relaxed text-slate-500">
			A cancel writes an <code class="text-[11px]">eventExceptions</code> row with
			<code class="text-[11px]">is_cancelled</code> and leaves the series alone — which is why the
			archive still shows it at its original time.
		</p>
	</div>
{/if}
